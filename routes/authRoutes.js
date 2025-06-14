const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Ruta de registro
router.post('/register', async (req, res) => {
    try {
        // Verificación completa del body
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Cuerpo de la solicitud no proporcionado o formato incorrecto',
                requiredFields: ['name', 'email', 'password']
            });
        }

        const { name, email, password } = req.body;

        // Validación de campos requeridos
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos son requeridos',
                missingFields: [
                    !name ? 'name' : null,
                    !email ? 'email' : null,
                    !password ? 'password' : null
                ].filter(Boolean)
            });
        }

        // Verificar si el usuario ya existe
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(409).json({
                success: false,
                message: 'El usuario ya existe'
            });
        }

        // Crear el nuevo usuario (el rol se asignará por defecto desde el modelo User.js)
        const user = new User({ name, email, password });

        // Guardar el usuario en la base de datos
        await user.save();

        // Generar un token JWT incluyendo el rol
        const tokenPayload = { 
            userId: user._id, 
            role: user.role // <--- CAMBIO: Incluir rol en el token
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: '30d', // O el tiempo que prefieras
        });

        // Respuesta exitosa, incluyendo el rol del usuario
        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role // <---  Devolver rol en la respuesta
            }
        });

    } catch (err) {
        console.error('Error en el registro:', err);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor durante el registro',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Ruta de login
router.post('/login', async (req, res) => {
    try {
        // Validar body
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Cuerpo de la solicitud no proporcionado o formato incorrecto'
            });
        }

        const { email, password } = req.body;

        // Validar campos requeridos
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email y contraseña son requeridos',
                missingFields: [
                    !email ? 'email' : null,
                    !password ? 'password' : null
                ].filter(Boolean)
            });
        }

        // Buscar usuario
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas (usuario no encontrado)'
            });
        }

        // Verificar contraseña
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas (contraseña incorrecta)'
            });
        }

        // Generar token incluyendo el rol
        const tokenPayload = { 
            userId: user._id, 
            role: user.role 
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
            expiresIn: '30d' 
        });

        // Respuesta exitosa, incluyendo el rol del usuario
        res.status(200).json({
            success: true,
            message: 'Login exitoso',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role 
            }
        });

    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({
            success: false,
            message: 'Error en el servidor durante el login',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

module.exports = router;
