const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const router = express.Router();

// Helper para formatear la respuesta del carrito
const formatCartResponse = (cartDocument) => {
  if (!cartDocument) return null;
  const products = Array.isArray(cartDocument.products) ? cartDocument.products : [];
  return {
    ...cartDocument,
    products: products.map(item => {
      const productDetails = item.productId;
      return {
        ...item,
        productId: productDetails ? productDetails._id : null,
        product: productDetails,
      };
    })
  };
};

// Ruta POST /merge - Fusionar carrito de invitado con el del usuario
router.post('/merge', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  let attempt = 0;

  try {
    const mergedCartDocument = await session.withTransaction(async (currentSession) => {
      attempt++;
      console.log(`Ruta /merge: Intento de transacción #${attempt}`);

      const { guestCart } = req.body;
      const userId = req.user.userId;

      if (!Array.isArray(guestCart)) {
        const err = new Error('Formato de carrito inválido: se espera un array');
        err.isValidationError = true;
        err.statusCode = 400;
        throw err;
      }

      const validItemsTransaction = [];
      const invalidItemsTransaction = [];
      guestCart.forEach((item, index) => {
        const isValid = item &&
          mongoose.Types.ObjectId.isValid(item.productId) &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0;
        isValid ? validItemsTransaction.push(item) : invalidItemsTransaction.push({ item, index, reason: 'Formato o valor inválido' });
      });

      if (invalidItemsTransaction.length > 0) {
        const err = new Error('Items inválidos detectados en guestCart durante merge');
        err.isValidationError = true;
        err.statusCode = 400;
        err.details = {
          invalidCount: invalidItemsTransaction.length,
          invalidItems: invalidItemsTransaction.map(({ item, index, reason }) => ({ index, itemReceived: item, reason })),
          sampleError: invalidItemsTransaction[0]
        };
        throw err;
      }
      
      if (validItemsTransaction.length === 0 && guestCart.length > 0) {
        console.log('Ruta /merge: No hay items válidos en guestCart para fusionar.');
      }

      let userCart = await Cart.findOne({ userId }).session(currentSession);

      if (!userCart) {
        console.log(`Ruta /merge: Creando nuevo carrito para userId: ${userId}`);
        userCart = new Cart({ userId, products: [] });
      }

      if (!userCart.products) {
        userCart.products = [];
      }

      const productMap = new Map();
      userCart.products.forEach(item => {
        if (item.productId) {
          productMap.set(item.productId.toString(), item);
        }
      });

      validItemsTransaction.forEach(guestItem => {
        const productIdStr = guestItem.productId.toString();
        productMap.set(productIdStr, {
          productId: new mongoose.Types.ObjectId(guestItem.productId),
          quantity: guestItem.quantity
        });
      });

      userCart.products = Array.from(productMap.values());

      await userCart.save({ session: currentSession });
      console.log(`Ruta /merge: Carrito guardado exitosamente en transacción para userId: ${userId}`);
      return userCart;
    });

    if (!mergedCartDocument) {
      console.error('Ruta /merge: mergedCartDocument fue null/undefined después de withTransaction');
      throw new Error('La transacción de fusión no devolvió un resultado de carrito.');
    }

    const populatedCart = await Cart.findById(mergedCartDocument._id)
      .populate({
        path: 'products.productId',
        model: 'Product',
        select: 'name price image stock isOnSale salePrice' 
      })
      .lean();

    if (!populatedCart) {
      console.error(`Ruta /merge: No se pudo encontrar el carrito ${mergedCartDocument._id} para poblar después de la transacción.`);
      throw new Error('No se pudo poblar el carrito después de la fusión.');
    }
    
    res.status(200).json({
      success: true,
      message: "Carrito fusionado exitosamente.",
      cart: formatCartResponse(populatedCart)
    });

  } catch (err) {
    console.error('*********************************************');
    console.error(`ERROR FINAL EN RUTA /merge (después de ${attempt} intentos):`, err.message);
    if(err.stack) console.error('Stack:', err.stack);
    if (err.details) console.error('Detalles del Error:', err.details);
    console.error('*********************************************');

    if (err.isValidationError === true && err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        ...(err.details && { details: err.details })
      });
    }
    
    const isWriteConflict = err.errorLabels && err.errorLabels.includes('TransientTransactionError');

    res.status(500).json({
      success: false,
      message: 'Error interno al fusionar carritos' + (isWriteConflict ? ' (conflicto de escritura, reintentos fallidos)' : ''),
      error: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error inesperado.'
    });
  } finally {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    await session.endSession();
  }
});

// Ruta POST /add - Agregar producto al carrito (CON VALIDACIÓN DE STOCK)
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user.userId;

    if (!productId || quantity == null) {
      return res.status(400).json({ success: false, message: 'productId y quantity son requeridos' });
    }
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'productId inválido' });
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'quantity debe ser un entero positivo' });
    }

    //INICIO DE LA LÓGICA DE STOCK
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, products: [] });
    }

    const productObjectId = new mongoose.Types.ObjectId(productId);
    const existingProductIndex = cart.products.findIndex(p => p.productId.equals(productObjectId));

    let quantityInCart = 0;
    if (existingProductIndex >= 0) {
      quantityInCart = cart.products[existingProductIndex].quantity;
    }

    // Comprobar si la cantidad que se quiere agregar MÁS la que ya está en el carrito excede el stock
    if ((quantityInCart + quantity) > product.stock) {
      return res.status(400).json({
        success: false,
        message: `No hay suficiente stock para '${product.name}'. Solo quedan ${product.stock} unidades disponibles.`,
        stockAvailable: product.stock,
      });
    }
    //FIN DE LA LÓGICA DE STOCK

    // La lógica para agregar o actualizar.
    if (existingProductIndex >= 0) {
      cart.products[existingProductIndex].quantity += quantity;
    } else {
      cart.products.push({ productId: productObjectId, quantity });
    }

    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'products.productId',
        model: 'Product',
        select: 'name price image stock isOnSale salePrice', 
      })
      .lean();

    res.status(200).json({
      success: true,
      message: 'Producto agregado al carrito',
      cart: formatCartResponse(populatedCart)
    });

  } catch (err) {
    console.error('Error en /add:', err);
    res.status(500).json({ success: false, message: 'Error al agregar producto', error: err.message });
  }
});


// Ruta POST /checkout - Simula la compra, valida stock y lo actualiza
router.post('/checkout', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let finalCart;
    await session.withTransaction(async () => {
      const userId = req.user.userId;
      
      // 1. Obtener el carrito del usuario con los productos populados DENTRO de la transacción
      const cart = await Cart.findOne({ userId }).session(session).populate('products.productId');
      if (!cart || cart.products.length === 0) {
        throw new Error('Tu carrito está vacío.');
      }

      // 2. Verificar el stock de cada producto en el carrito
      for (const item of cart.products) {
        const product = item.productId; // El producto ya está populado
        if (product.stock < item.quantity) {
          // Si no hay suficiente stock, abortar la transacción
          throw new Error(`Stock insuficiente para '${product.name}'. Quedan ${product.stock} y tu carrito tiene ${item.quantity}.`);
        }
      }

      // 3. Si hay stock para todo, actualizar el stock de cada producto
      const updatePromises = cart.products.map(item => {
        return Product.updateOne(
          { _id: item.productId._id },
          { $inc: { stock: -item.quantity } }, // Restar la cantidad del stock
          { session }
        );
      });
      await Promise.all(updatePromises);

      // 4. Vaciar el carrito del usuario
      cart.products = [];
      await cart.save({ session });
      
      finalCart = cart; // Guardar el carrito vacío para la respuesta
    });

    res.status(200).json({
        success: true,
        message: '¡Compra simulada exitosamente! Tu carrito ha sido vaciado.',
        cart: formatCartResponse(finalCart.toObject())
    });

  } catch (error) {
    console.error('Error en /checkout:', error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});


// Ruta POST /update - Actualizar carrito completo.
router.post('/update', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, message: 'products debe ser un arreglo' });
    }

    const validatedProducts = [];
    for (const p of products) {
      if (
        !p.productId ||
        !mongoose.Types.ObjectId.isValid(p.productId) ||
        typeof p.quantity !== 'number' ||
        p.quantity < 0
      ) {
        console.error('Producto inválido en /update:', p);
        return res.status(400).json({
          success: false,
          message: 'Productos inválidos en el arreglo. Verifica productId y quantity.',
          invalidProduct: p
        });
      }
      if (p.quantity > 0) {
        validatedProducts.push({
          productId: new mongoose.Types.ObjectId(p.productId),
          quantity: p.quantity
        });
      }
    }
    
    const updatedCart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { products: validatedProducts } },
      { new: true, upsert: true, runValidators: true }
    ).populate({
      path: 'products.productId',
      model: 'Product',
      select: 'name price image stock isOnSale salePrice', 
    }).lean();
    
    res.json({
      success: true,
      message: 'Carrito actualizado',
      cart: formatCartResponse(updatedCart)
    });
  } catch (err) {
    console.error('Error en /update:', err);
    res.status(500).json({ success: false, message: 'Error actualizando carrito', error: err.message });
  }
});

// Ruta DELETE /remove/:productId - Eliminar producto específico.
router.delete('/remove/:productId', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'productId inválido' });
    }
    const productObjectId = new mongoose.Types.ObjectId(productId);

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $pull: { products: { productId: productObjectId } } },
      { new: true }
    ).populate({
      path: 'products.productId',
      model: 'Product',
      select: 'name price image stock isOnSale salePrice', // <-- CORREGIDO
    }).lean();

    if (!cart) {
      console.log(`Ruta /remove: Carrito no encontrado para userId ${userId} o producto no estaba. Devolviendo carrito vacío.`);
      return res.status(200).json({ 
        success: true,
        message: 'Producto no encontrado en el carrito o carrito no existente.',
        cart: formatCartResponse({ userId, products: [] })
      });
    }

    res.status(200).json({
      success: true,
      message: 'Producto eliminado',
      cart: formatCartResponse(cart)
    });

  } catch (err) {
    console.error('Error en /remove/:productId:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar producto', error: err.message });
  }
});

// Ruta DELETE /clear - Vaciar carrito completamente.
router.delete('/clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { products: [] } },
      { new: true, upsert: true }
    ).populate({
      path: 'products.productId',
      model: 'Product',
      select: 'name price image stock isOnSale salePrice', // <-- CORREGIDO
    }).lean();
    
    res.status(200).json({
      success: true,
      message: 'Carrito vaciado',
      cart: formatCartResponse(cart)
    });

  } catch (err) {
    console.error('Error en /clear:', err);
    res.status(500).json({ success: false, message: 'Error al vaciar carrito', error: err.message });
  }
});

// Ruta GET / - Obtener carrito del usuario
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`[GET /api/cart] Solicitud para userId: ${userId}`);

    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'products.productId',
        model: 'Product',
        select: 'name price image stock isOnSale salePrice', // <-- CORREGIDO
      })
      .lean();

    if (!cart) {
      console.log(`[GET /api/cart] No se encontró carrito para userId: ${userId}. Devolviendo carrito vacío.`);
      return res.status(200).json({
        success: true,
        cart: formatCartResponse({
          _id: null,
          userId: userId,
          products: [],
          __v: 0
        })
      });
    }
    
    console.log(`[GET /api/cart] Carrito encontrado y populado para userId: ${userId}`);
    res.status(200).json({
      success: true,
      cart: formatCartResponse(cart)
    });

  } catch (err) {
    console.error('Error en GET /api/cart:', err);
    res.status(500).json({ success: false, message: 'Error al obtener carrito', error: err.message });
  }
});

module.exports = router;