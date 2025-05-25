// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// Middleware para verificar el token JWT
const authMiddleware = (req, res, next) => {
  // Verifica si el token está presente en los headers (Authorization)
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    // Si no hay token, el acceso es denegado
    return res.status(401).json({ message: 'Acceso denegado. No se proporcionó el token.' });
  }

  try {
    // Verifica el token usando la clave secreta
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Si es válido, añade la información del usuario al objeto 'req'
    req.user = decoded;  // Almacena el userId del token en 'req.user'
    next();  // Continúa con la siguiente función o ruta
  } catch (err) {
    // Si el token no es válido o ha expirado
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }
};

module.exports = authMiddleware;
