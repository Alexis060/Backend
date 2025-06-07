// routes/productRoutes.js
const express = require('express');
const Product = require('../models/Product');
const router = express.Router();

// Importa tus middlewares de autenticación y autorización de roles
// Asegúrate de que las rutas relativas sean correctas según tu estructura de carpetas
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// Obtener todos los productos (sin cambios, sigue siendo pública)
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (err) {
    console.error("Error al obtener productos:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al obtener productos.', error: err.message });
  }
});

// GET /api/products/search?q=terminoDeBusqueda
// Esta ruta busca productos por nombre.
router.get('/search', async (req, res) => {
  try {
    const searchTerm = req.query.q; // 'q' es el nombre común para el parámetro de consulta (query)

    if (!searchTerm) {
      return res.status(400).json({ success: false, message: 'Se requiere un término de búsqueda.' });
    }

    // Busca en la base de datos productos donde el nombre contenga el término de búsqueda.
    // '$regex' es para buscar patrones (similar a LIKE en SQL).
    // '$options: 'i'' hace que la búsqueda no distinga entre mayúsculas y minúsculas.
    const products = await Product.find({
      name: { $regex: searchTerm, $options: 'i' }
    });

    res.json(products);

  } catch (err) {
    console.error("Error en la búsqueda de productos:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al realizar la búsqueda.' });
  }
});

// Obtener productos por categoría (existente, sin cambios)
router.get('/category/:categoryName', async (req, res) => {
  try {
    const validCategories = ['snacks', 'higiene', 'bebidas', 'lacteos'];
    const categoryName = req.params.categoryName.toLowerCase();

    // Verificación opcional para asegurar que la categoría es válida
    if (!validCategories.includes(categoryName)) {
      return res.status(400).json({ success: false, message: 'La categoría proporcionada no es válida.' });
    }

    const products = await Product.find({ category: categoryName });
    res.json(products);
  } catch (err) {
    console.error("Error al obtener productos por categoría:", err);
    res.status(500).json({ success: false, message: 'Error en el servidor al obtener productos por categoría.', error: err.message });
  }
});


// Crear nuevo producto (existente, sin cambios)
router.post(
  '/', 
  authMiddleware, 
  authorizeRoles(['operative', 'admin']), 
  async (req, res) => {
    const { name, price, imageUrl, stock, category } = req.body;

    if (!name || typeof price === 'undefined' || !imageUrl || !category) {
      return res.status(400).json({
        success: false,
        message: 'Nombre, precio, URL de imagen y categoría son requeridos.',
      });
    }
    if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({
            success: false,
            message: 'El precio debe ser un número válido y no negativo.'
        });
    }

    try {
      const productData = {
        name,
        price,
        image: imageUrl, 
        stock: stock || 0,
        category,
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
        return res.status(400).json({ success: false, message: 'Error de validación. Verifica que la categoría sea válida.', errors: err.errors });
      }
      res.status(500).json({ success: false, message: 'Error en el servidor al crear el producto.', error: err.message });
    }
  }
);

// Actualizar producto (existente, sin cambios)
router.put(
  '/:id', 
  authMiddleware, 
  authorizeRoles(['admin', 'operative']), 
  async (req, res) => {
  const { name, price, imageUrl, stock, category } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (typeof price !== 'undefined') {
    if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ success: false, message: 'El precio debe ser un número válido y no negativo.' });
    }
    updates.price = price;
  }
  if (imageUrl) updates.image = imageUrl; 
  if (typeof stock !== 'undefined') updates.stock = stock;
  if (category) updates.category = category;

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
        return res.status(400).json({ success: false, message: 'Error de validación.', errors: err.errors });
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

// Eliminar producto (existente, sin cambios)
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