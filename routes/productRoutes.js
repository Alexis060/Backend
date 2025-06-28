// routes/productRoutes.js
const express = require('express');
const Product = require('../models/Product');
const Category = require('../models/Category'); 
const router = express.Router();

// Importa middlewares de autenticación y autorización de roles
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({}).populate('category', 'name');
    res.json(products);
  } catch (err) {
    console.error("Error al obtener productos:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al obtener productos.', error: err.message });
  }
});

router.get('/offers', async (req, res) => {
    try {
        const offerProducts = await Product.find({ isOnSale: true }).populate('category', 'name');
        res.json(offerProducts);
    } catch (err) {
        console.error("Error al obtener productos en oferta:", err);
        res.status(500).json({ success: false, message: 'Error en el servidor al obtener las ofertas.' });
    }
});


// Buscar productos por nombre
router.get('/search', async (req, res) => {
  try {
    const searchTerm = req.query.q; 
    if (!searchTerm) {
      return res.status(400).json({ success: false, message: 'Se requiere un término de búsqueda.' });
    }
    const products = await Product.find({
      name: { $regex: searchTerm, $options: 'i' }
    }).populate('category', 'name');
    res.json(products);
  } catch (err) {
    console.error("Error en la búsqueda de productos:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al realizar la búsqueda.' });
  }
});

// Obtener productos por categoría
router.get('/category/:categoryName', async (req, res) => {
  try {
    const categoryName = req.params.categoryName.toLowerCase();
    const category = await Category.findOne({ name: { $regex: new RegExp(`^${categoryName}$`, 'i') } });
    if (!category) {
      return res.json([]);
    }
    const products = await Product.find({ category: category._id }).populate('category', 'name');
    res.json(products);
  } catch (err) {
    console.error("Error al obtener productos por categoría:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al obtener productos por categoría.', error: err.message });
  }
});


// GET los 5 productos más recientes (Debe ir ANTES de /:id)
router.get('/latest/new', async (req, res) => {
  try {
    const latestProducts = await Product.find({})
      .sort({ createdAt: -1 }) // Ordena por fecha de creación, descendente
      .limit(5)               // Limita el resultado a 5 productos
      .select('name image _id'); // Solo trae los campos necesarios

    res.json(latestProducts);
  } catch (err) {
    console.error("Error al obtener últimos productos:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al obtener los últimos productos.' });
  }
});

// Obtener un solo producto por su ID
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category', 'name');
        if (!product) {
            return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
        }
        res.json(product);
    } catch (error) {
        console.error("Error al obtener producto por ID:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});


// Crear nuevo producto (con campos de oferta)
router.post(
  '/', 
  authMiddleware, 
  authorizeRoles(['operative', 'admin']), 
  async (req, res) => {
    const { name, price, imageUrl, stock, category, isOnSale, salePrice } = req.body;

    if (!name || typeof price === 'undefined' || !imageUrl || !category) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio, URL de imagen y categoría son requeridos.',
      });
    }

    try {
      const productData = {
        name,
        price,
        image: imageUrl, 
        stock: stock || 0,
        category,
        isOnSale: isOnSale || false,
        salePrice: (isOnSale && salePrice) ? salePrice : undefined
      };

      const product = new Product(productData);
      const savedProduct = await product.save();
      
      res.status(201).json({
        success: true,
        message: 'Producto agregado exitosamente',
        product: savedProduct
      });

    } catch (err) {
      console.error("Error al crear producto:", err);
      if (err.name === 'ValidationError') {
  return res.status(400).json({ success: false, message: err.message, errors: err.errors });
      }
      res.status(500).json({ success: false, message: 'Error en el servidor al crear el producto.', error: err.message });
    }
  }
);

// Actualizar producto (con campos de oferta)
router.put(
  '/:id', 
  authMiddleware, 
  authorizeRoles(['admin', 'operative']), 
  async (req, res) => {
  const { name, price, imageUrl, stock, category, isOnSale, salePrice } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (typeof price !== 'undefined') updates.price = price;
  if (imageUrl) updates.image = imageUrl; 
  if (typeof stock !== 'undefined') updates.stock = stock;
  if (category) updates.category = category;
  if (typeof isOnSale !== 'undefined') updates.isOnSale = isOnSale;
  
  // Solo actualiza salePrice si se proporciona. Si isOnSale es false, se establece en null.
  if (isOnSale === false) {
    updates.salePrice = null;
  } else if (typeof salePrice !== 'undefined') {
    updates.salePrice = salePrice;
  }

  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates }, 
      { new: true, runValidators: true } 
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }
    res.json({ success: true, message: 'Producto actualizado exitosamente', product });
  } catch (err) {
    console.error("Error al actualizar producto:", err);
    if (err.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: err.message, errors: err.errors });
    }
     if (err.name === 'CastError' && err.kind === 'ObjectId') {
        return res.status(400).json({
            success: false,
            message: 'El ID de producto proporcionado no es válido.'
        });
    }
    res.status(500).json({ success: false, message: 'Error en el servidor al actualizar el producto.', error: err.message });
  }
});

// Eliminar producto
router.delete(
  '/:id', 
  authMiddleware, 
  authorizeRoles(['admin', 'operative']),
  async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado.' });
    }
    res.json({ success: true, message: 'Producto eliminado exitosamente' });
  } catch (err) {
    console.error("Error al eliminar producto:", err);
     if (err.name === 'CastError' && err.kind === 'ObjectId') {
        return res.status(400).json({
            success: false,
            message: 'El ID de producto proporcionado no es válido.'
        });
    }
    res.status(500).json({ success: false, message: 'Error en el servidor al eliminar el producto.', error: err.message });
  }
});

module.exports = router;