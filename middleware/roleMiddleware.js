// middleware/roleMiddleware.js

/**
 * Middleware para autorizar el acceso basado en roles de usuario.
 * @param {string[]} allowedRoles - Un array de strings que representan los roles permitidos.
 * Ejemplo: ['admin', 'operative']
 * @returns {function} Express middleware function.
 */
const authorizeRoles = (allowedRoles) => {
  return (req, res, next) => {
    // Paso 1: Verificar que el usuario esté autenticado y que su rol esté disponible.
    //         Esto depende de que el `authMiddleware` haya añadido `req.user`
    //         y que `req.user` tenga una propiedad `role`.
    if (!req.user || typeof req.user.role === 'undefined') {
      // Log para el servidor para entender qué pasó
      console.warn('Intento de acceso a ruta protegida por rol sin rol de usuario definido o usuario no autenticado. Ruta:', req.path);
      return res.status(403).json({ // 403 Forbidden es el código HTTP apropiado
        success: false,
        message: 'Acceso denegado. No se ha podido determinar el rol del usuario o el usuario no está autenticado.',
      });
    }

    // Paso 2: Verificar que `allowedRoles` sea un array y no esté vacío.
    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
      console.error('Error de configuración en authorizeRoles: El parámetro "allowedRoles" debe ser un array con al menos un rol. Ruta:', req.path);
      return res.status(500).json({ // Error del servidor porque el middleware está mal configurado
        success: false,
        message: 'Error de configuración del servidor: Roles permitidos no especificados correctamente para esta ruta.'
      });
    }

    // Paso 3: Verificar si el rol del usuario está en la lista de roles permitidos para esta ruta.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ // 403 Forbidden
        success: false,
        message: `Acceso denegado. Tu rol ('${req.user.role}') no tiene permiso para acceder a este recurso. Se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}.`,
      });
    }

    // Si todas las verificaciones pasan, el usuario tiene el rol adecuado.
    // Permite que la solicitud continúe al siguiente middleware o al controlador de la ruta.
    next();
  };
};

// Exportar la función para que pueda ser importada en otros archivos (como adminroutes.js)
module.exports = authorizeRoles;