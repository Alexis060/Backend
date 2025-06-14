// routes/categoryRoutes.js
const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Product = require('../models/Product');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

// === RUTAS ESTÁTICAS PRIMERO ===

// GET /api/categories - Obtener todas las categorías
router.get('/', async (req, res) => {
    try {
        const categories = await Category.find({}).sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener categorías.' });
    }
});

// POST /api/categories - Crear una nueva categoría
router.post('/', authMiddleware, authorizeRoles(['admin', 'operative']), async (req, res) => {
    const { name, imageUrl } = req.body;
    if (!name || !imageUrl) {
        return res.status(400).json({ success: false, message: 'El nombre y la URL de la imagen de la categoría son requeridos.' });
    }
    try {
        const newCategory = new Category({ name, imageUrl });
        await newCategory.save();
        res.status(201).json({ success: true, message: 'Categoría creada exitosamente.', category: newCategory });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'Esa categoría ya existe.' });
        }
        res.status(500).json({ success: false, message: 'Error al crear la categoría.' });
    }
});



// GET /api/categories/:id - Obtener una sola categoría por su ID
router.get('/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Categoría no encontrada.' });
        }
        res.json(category);
    } catch (error) {
        console.error("Error al obtener categoría por ID:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});

// PUT /api/categories/:id - Actualizar una categoría existente
router.put('/:id', authMiddleware, authorizeRoles(['admin', 'operative']), async (req, res) => {
    const { name, imageUrl } = req.body;
    if (!name || !imageUrl) {
        return res.status(400).json({ success: false, message: 'Tanto el nombre como la URL de la imagen son requeridos para la actualización.' });
    }
    try {
        const updatedCategory = await Category.findByIdAndUpdate(
            req.params.id,
            { name, imageUrl },
            { new: true, runValidators: true }
        );

        if (!updatedCategory) {
            return res.status(404).json({ success: false, message: 'Categoría no encontrada para actualizar.' });
        }
        res.json({ success: true, message: 'Categoría actualizada exitosamente.', category: updatedCategory });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'El nombre de esa categoría ya está en uso.' });
        }
        console.error("Error al actualizar categoría:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor al actualizar la categoría.' });
    }
});

// DELETE /api/categories/:id - Eliminar una categoría
router.delete('/:id', authMiddleware, authorizeRoles(['admin', 'operative']), async (req, res) => {
    try {
        const categoryId = req.params.id;
        const productUsingCategory = await Product.findOne({ category: categoryId });
        if (productUsingCategory) {
            return res.status(400).json({ 
                success: false, 
                message: 'No se puede eliminar la categoría porque está siendo usada por al menos un producto.' 
            });
        }
        const deletedCategory = await Category.findByIdAndDelete(categoryId);
        if (!deletedCategory) {
            return res.status(404).json({ success: false, message: 'Categoría no encontrada.' });
        }
        res.json({ success: true, message: 'Categoría eliminada exitosamente.' });
    } catch (error) {
        console.error("Error al eliminar categoría:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor al eliminar la categoría.' });
    }
});


module.exports = router;
