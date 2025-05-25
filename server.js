// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Importar modelos
const Product = require('./models/Product'); // Opcional si no se usa directamente aquí

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const cartRoutes = require('./routes/cartRoutes');
const productRoutes = require('./routes/productRoutes');

const app = express();

//  Middlewares 
app.use(cors());
app.use(express.json());  // Asegura que pueda leer JSON en POST

// Middleware de logging para diagnóstico
app.use((req, res, next) => {
  console.log(`Incoming ${req.method} request to ${req.path}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});


app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/products', productRoutes);

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
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log(' Conectado a MongoDB');
  app.listen(5000, () => console.log('🚀 Servidor corriendo en http://localhost:5000'));
})
.catch(err => console.error(' Error al conectar a MongoDB:', err));
