const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Cart = require('../models/Cart');
const Product = require('../models/Product'); 
const mongoose = require('mongoose');
const router = express.Router();

// Helper para formatear la respuesta del carrito
const formatCartResponse = (cartDocument) => {
  if (!cartDocument) return null;
  // Asegurarse de que products sea un array, incluso si es null/undefined en el documento
  const products = Array.isArray(cartDocument.products) ? cartDocument.products : [];
  return {
    ...cartDocument, // Usar .toObject() o .lean() si es un documento de Mongoose completo
    products: products.map(item => {
      
      const productDetails = item.productId;
      return {
        ...item, // Esto podría ser item.toObject() si es un subdocumento
        productId: productDetails ? productDetails._id : null, // El ID del producto
        product: productDetails, // El objeto Product completo populado
        // quantity ya está en item
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

      if (!userCart.products) { // Asegurar que products exista
        userCart.products = [];
      }

      const productMap = new Map();
      // Poblar el mapa con los productos existentes en el carrito del usuario
      userCart.products.forEach(item => {
        if (item.productId) {
          productMap.set(item.productId.toString(), item); // Guardar el item completo para mantener _id si es necesario
        }
      });

      // Fusionar con los productos del carrito de invitado
      validItemsTransaction.forEach(guestItem => {
        const productIdStr = guestItem.productId.toString();

        // Esto evita la suma de cantidades que causaba la duplicación.
        productMap.set(productIdStr, {
            productId: new mongoose.Types.ObjectId(guestItem.productId),
            quantity: guestItem.quantity
        });
      });

      userCart.products = Array.from(productMap.values());

      await userCart.save({ session: currentSession });
      console.log(`Ruta /merge: Carrito guardado exitosamente en transacción para userId: ${userId}`);
      return userCart; // Devolver el documento de Mongoose
    });

    if (!mergedCartDocument) {
        console.error('Ruta /merge: mergedCartDocument fue null/undefined después de withTransaction');
        throw new Error('La transacción de fusión no devolvió un resultado de carrito.');
    }

    // Popular fuera de la transacción
    const populatedCart = await Cart.findById(mergedCartDocument._id)
      .populate({
          path: 'products.productId',
          model: 'Product', 
          select: 'name price image stock'
      })
      .lean(); // .lean() para obtener un objeto JS plano

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

// Ruta POST /add - Agregar producto al carrito
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

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, products: [] });
    }

    const productObjectId = new mongoose.Types.ObjectId(productId);
    const index = cart.products.findIndex(p => p.productId.equals(productObjectId));

    if (index >= 0) {
      cart.products[index].quantity += quantity;
    } else {
      cart.products.push({ productId: productObjectId, quantity });
    }

    await cart.save();

    const populatedCart = await Cart.findById(cart._id)
        .populate({
            path: 'products.productId',
            model: 'Product',
            select: 'name price image stock',
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

// Ruta POST /update - Actualizar carrito completo (usado por saveCart en frontend)
router.post('/update', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { products } = req.body;

    console.log('Ruta /update recibida con:', JSON.stringify(products, null, 2));

    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, message: 'products debe ser un arreglo' });
    }

    const validatedProducts = [];
    for (const p of products) {
      if (
        !p.productId ||
        !mongoose.Types.ObjectId.isValid(p.productId) ||
        typeof p.quantity !== 'number' ||
        p.quantity < 0 // Permitir cantidad 0 para potencialmente eliminar
      ) {
        console.error('Producto inválido en /update:', p);
        return res.status(400).json({
          success: false,
          message: 'Productos inválidos en el arreglo. Verifica productId y quantity.',
          invalidProduct: p
        });
      }
      if (p.quantity > 0) { // Solo guardar productos con cantidad > 0
        validatedProducts.push({
          productId: new mongoose.Types.ObjectId(p.productId),
          quantity: p.quantity
        });
      }
    }
    
    console.log('Ruta /update - Validated products para guardar:', JSON.stringify(validatedProducts, null, 2));

    const updatedCart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { products: validatedProducts } },
      { new: true, upsert: true, runValidators: true }
    ).populate({
        path: 'products.productId',
        model: 'Product',
        select: 'name price image stock',
    }).lean();
    
    console.log('Ruta /update - Carrito después de findOneAndUpdate y populate:', JSON.stringify(updatedCart, null, 2));

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

// Ruta DELETE /remove/:productId - Eliminar producto específico
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
        select: 'name price image stock',
    }).lean();

    if (!cart) {
        // Si el carrito no existía, findOneAndUpdate con $pull no lo creará.
        // Devolver un carrito vacío si el usuario no tenía uno.
        console.log(`Ruta /remove: Carrito no encontrado para userId ${userId} o producto no estaba. Devolviendo carrito vacío.`);
        return res.status(200).json({ 
            success: true,
            message: 'Producto no encontrado en el carrito o carrito no existente.',
            cart: formatCartResponse({ userId, products: [] }) // Estructura de carrito vacío
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

// Ruta DELETE /clear - Vaciar carrito completamente
router.delete('/clear', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { products: [] } },
      { new: true, upsert: true } 
    ).populate({
        path: 'products.productId', // Aunque products esté vacío, mantenemos populate por consistencia
        model: 'Product',
        select: 'name price image stock',
    }).lean();
    
    res.status(200).json({
      success: true,
      message: 'Carrito vaciado',
      cart: formatCartResponse(cart) // Debería tener products: []
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
          select: 'name price image stock',
      })
      .lean();

    if (!cart) {
      console.log(`[GET /api/cart] No se encontró carrito para userId: ${userId}. Devolviendo carrito vacío.`);
      return res.status(200).json({
          success: true,
          cart: formatCartResponse({ // Estructura de carrito vacío consistente
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
