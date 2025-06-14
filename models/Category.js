// models/Category.js
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    imageUrl: {
        type: String,
        required: true // Hacemos que la imagen sea obligatoria para cada categoría
    }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);