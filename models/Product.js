// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  stock: { type: Number, default: 0 },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  // --- CAMPOS PARA OFERTAS ---
  isOnSale: {
    type: Boolean,
    default: false // Por defecto, un producto no está en oferta
  },
  salePrice: {
    type: Number,
    default: 0 // Precio de oferta, 0 si no está en oferta
  }
});

// Validación para asegurar que si está en oferta, el precio de oferta sea menor
productSchema.pre('save', function(next) {
  if (this.isOnSale && this.salePrice >= this.price) {
    next(new Error('El precio de oferta debe ser menor que el precio original.'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Product', productSchema);
