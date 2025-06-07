// models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String }, 
  stock: { type: Number, default: 0 },

  category: {
    type: String,
    required: true, // Hacemos que la categoría sea obligatoria
    enum: ['snacks', 'higiene', 'bebidas', 'lacteos'] // Solo estos valores son permitidos
  }
  // -------------------
});

module.exports = mongoose.model('Product', productSchema);