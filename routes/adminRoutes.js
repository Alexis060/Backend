// routes/adminRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs'); // Necesario si vas a manejar contraseñas, aunque el pre-save hook lo hace en el modelo
const User = require('../models/User'); // Tu modelo de Usuario
const authMiddleware = require('../middleware/authMiddleware'); // Middleware de autenticación
const authorizeRoles = require('../middleware/roleMiddleware'); // Middleware de autorización por roles

const router = express.Router();

// Ruta POST para que un administrador cree un usuario con rol "operative"
// Protegida por authMiddleware (debe estar logueado) y authorizeRoles(['admin']) (debe ser admin)
router.post(
  '/users/create-operative',
  authMiddleware,
  authorizeRoles(['admin']), // Solo los administradores pueden acceder
  async (req, res) => {
    try {
      const { name, email, password } = req.body;

      // Validación básica de campos requeridos
      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Nombre, email y contraseña son requeridos para crear un usuario operativo.',
        });
      }

      // Verificar si el usuario ya existe por email
      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un usuario con ese correo electrónico.',
        });
      }

      // Crear el nuevo usuario con el rol 'operative'
      // La contraseña se hasheará automáticamente gracias al pre-save hook en tu modelo User.js
      const newUser = new User({
        name,
        email,
        password,
        role: 'operative', // Asignar directamente el rol 'operative'
      });

      await newUser.save();

      // No devolver la contraseña en la respuesta
      const userToReturn = {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      };

      return res.status(201).json({
        success: true,
        message: 'Usuario operativo creado exitosamente.',
        user: userToReturn,
      });
    } catch (err) {
      console.error('Error creando usuario operativo:', err);
      if (err.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Error de validación.',
          errors: err.errors,
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor al crear el usuario operativo.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }
  }
);

// RUTA GET para que un administrador obtenga la lista de usuarios operativos
// GET /api/admin/users/operatives
router.get(
    '/users/operatives',
    authMiddleware,
    authorizeRoles(['admin']), // Solo los administradores pueden acceder
    async (req, res) => {
        try {
            // Busca todos los usuarios con rol 'operative' y no devuelve sus contraseñas
            const operativeUsers = await User.find({ role: 'operative' }).select('-password');
            res.json({
                success: true,
                users: operativeUsers
            });
        } catch (err) {
            console.error('Error obteniendo usuarios operativos:', err);
            res.status(500).json({
                success: false,
                message: 'Error en el servidor al obtener los usuarios operativos.',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined,
            });
        }
    }
);


// RUTA DELETE para que un administrador elimine un usuario operativo específico
// DELETE /api/admin/users/operative/:userId
router.delete(
    '/users/operative/:userId',
    authMiddleware,
    authorizeRoles(['admin']), // Solo los administradores pueden acceder
    async (req, res) => {
        try {
            const userIdToDelete = req.params.userId;

            // Medida de seguridad: Evitar que un admin se elimine a sí mismo a través de esta ruta
            // req.user.userId es el ID del admin que está haciendo la petición
            if (req.user.userId === userIdToDelete) {
                return res.status(400).json({
                    success: false,
                    message: 'Un administrador no puede eliminarse a sí mismo a través de esta ruta.'
                });
            }

            const userToDelete = await User.findById(userIdToDelete);

            if (!userToDelete) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuario no encontrado para eliminar.'
                });
            }

            // Verificación crucial: Asegurarse de que el usuario a eliminar sea 'operative'
            if (userToDelete.role !== 'operative') {
                return res.status(400).json({
                    success: false,
                    message: `Este endpoint solo está destinado a eliminar usuarios operativos. El usuario seleccionado tiene el rol: '${userToDelete.role}'.`
                });
            }

            await User.findByIdAndDelete(userIdToDelete);

            res.json({
                success: true,
                message: 'Usuario operativo eliminado exitosamente.'
            });

        } catch (err) {
            console.error('Error eliminando usuario operativo:', err);
            // Si el error es por un ObjectId inválido
            if (err.name === 'CastError' && err.kind === 'ObjectId') {
                 return res.status(400).json({
                    success: false,
                    message: 'El ID de usuario proporcionado no es válido.'
                });
            }
            res.status(500).json({
                success: false,
                message: 'Error en el servidor al eliminar el usuario operativo.',
                error: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        }
    }
);

// Exportar las rutas de administrador
module.exports = router;