const mongoose = require('mongoose');
const Product = require('../models/Product');

async function migrateImages() {
  try {
    await mongoose.connect('mongodb+srv://lextrade2000:Azteca@alexis060.tsatlqf.mongodb.net/tu_basedatos?retryWrites=true&w=majority&appName=Alexis060');
    console.log('Conectado a MongoDB Atlas');

    const result = await Product.updateMany(
      { image: { $exists: true } },
      [
        {
          $set: {
            image: {
              $replaceOne: {
                input: "$image",
                find: "/assets/",
                replacement: ""
              }
            }
          }
        },
        {
          $set: {
            image: {
              $replaceOne: {
                input: "$image",
                find: "/productos/",
                replacement: ""
              }
            }
          }
        }
      ]
    );

    console.log(`Documentos modificados: ${result.modifiedCount}`);

    await mongoose.disconnect();
    console.log('Desconectado de MongoDB Atlas');
  } catch (error) {
    console.error('Error durante la migración:', error);
  }
}

migrateImages();
