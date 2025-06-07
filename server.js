// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Importar modelos
// const Product = require('./models/Product'); // Opcional si no se usa directamente aquí

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require('./routes/cartRoutes');
const productRoutes = require('./routes/productRoutes');
const adminRoutes = require('./routes/adminRoutes'); // <--- 1. IMPORTA TUS ADMIN ROUTES

const app = express();

// Middlewares
app.use(cors());
app.use(express.json()); // Asegura que pueda leer JSON en POST

// Middleware de logging para diagnóstico
app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request to ${req.path}`);
  // Comentado para no ser tan verboso en producción, pero útil para debug
  // console.log('Headers:', req.headers);
  // console.log('Body:', req.body);
  next();
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes); // <--- 2. USA TUS ADMIN ROUTES (puedes elegir el prefijo que desees, /api/admin es común)

// Rutas de depuración (opcionales)
app.post('/debug-body', (req, res) => {
  res.json({
    headers: req.headers,
    body: req.body,
    bodyType: typeof req.body
  });
});

app.post('/test', (req, res) => {
  res.status(200).json({
    message: 'Todo bien con express.json()',
    receivedBody: req.body
  });
});

// Conexión a Mongo
mongoose.connect(process.env.MONGO_URI, {

})
.then(() => {
  console.log(' Conectado a MongoDB');
  const PORT = process.env.PORT || 5000; // Usar variable de entorno para el puerto es buena práctica
  app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));
})
.catch(err => console.error(' Error al conectar a MongoDB:', err));