// routes/adminRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs'); 
const User = require('../models/User'); 
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

const router = express.Router();

// Ruta POST para que un administrador cree un usuario con rol "operative"
router.post(
  '/users/create-operative',
  authMiddleware,
  authorizeRoles(['admin']),
  async (req, res) => {
    try {
      const { name, email, password } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Nombre, email y contraseña son requeridos para crear un usuario operativo.',
        });
      }

      const userExists = await User.findOne({ email });
      if (userExists) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un usuario con ese correo electrónico.',
        });
      }

      const newUser = new User({
        name,
        email,
        password,
        role: 'operative',
      });

      await newUser.save();

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
router.get(
    '/users/operatives',
    authMiddleware,
    authorizeRoles(['admin']),
    async (req, res) => {
        try {
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


// GET /api/admin/users/:userId
router.get('/users/:userId', authMiddleware, authorizeRoles(['admin']), async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en el servidor.' });
    }
});


// PUT /api/admin/users/:userId
router.put('/users/:userId', authMiddleware, authorizeRoles(['admin']), async (req, res) => {
    const { name, email, role } = req.body;
    const { userId } = req.params;

    if (!name || !email || !role) {
        return res.status(400).json({ success: false, message: 'Nombre, email y rol son requeridos para la actualización.' });
    }

    const validRoles = ['admin', 'operative', 'customer'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'El rol proporcionado no es válido.' });
    }

    try {
        const userToUpdate = await User.findById(userId);
        if (!userToUpdate) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado para actualizar.' });
        }

        // Medida de seguridad: Un admin no puede quitarse su propio rol de admin.
        if (req.user.userId === userId && userToUpdate.role === 'admin' && role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Un administrador no puede revocar su propio rol de administrador.' });
        }

        userToUpdate.name = name;
        userToUpdate.email = email;
        userToUpdate.role = role;

        // La contraseña no se modifica aquí. Se debería crear una ruta separada y más segura para eso.
        await userToUpdate.save();

        const userToReturn = {
            _id: userToUpdate._id,
            name: userToUpdate.name,
            email: userToUpdate.email,
            role: userToUpdate.role,
        };

        res.json({ success: true, message: 'Usuario actualizado exitosamente.', user: userToReturn });

    } catch (error) {
        // Manejar el caso de que el email ya esté en uso por otro usuario
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'El correo electrónico ya está en uso por otro usuario.' });
        }
        console.error("Error al actualizar usuario:", error);
        res.status(500).json({ success: false, message: 'Error en el servidor al actualizar el usuario.' });
    }
});


// RUTA DELETE para que un administrador elimine un usuario operativo específico
router.delete(
    '/users/operative/:userId',
    authMiddleware,
    authorizeRoles(['admin']),
    async (req, res) => {
        try {
            const userIdToDelete = req.params.userId;

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

module.exports = router;
