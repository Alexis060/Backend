const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Para encriptar la contraseña

// Esquema del modelo de usuario
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: { 
    type: String,
    enum: ['admin', 'operative', 'customer'], // Roles permitidos
    default: 'customer', // Rol por defecto para nuevos usuarios
  },
});

// Middleware para encriptar la contraseña antes de guardarla
userSchema.pre('save', async function (next) {
  // Solo hashear la contraseña si ha sido modificada (o es nueva)
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error); // Pasar el error al siguiente middleware/manejador
  }
});

// Método para comparar contraseñas
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Crear y exportar el modelo de usuario
const User = mongoose.model('User', userSchema);
module.exports = User;
