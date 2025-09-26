const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config(); // Carga las variables de entorno

const app = express();
app.use(express.json());
app.use(cors());

// 🔑 Conectar a MongoDB Atlas
const mongoURI = process.env.MONGO_URI;

// Mongoose ya no necesita las opciones useNewUrlParser y useUnifiedTopology
mongoose.connect(mongoURI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => {
    console.error("❌ Error de conexión a MongoDB Atlas:", err);
    process.exit(1); // Sale de la aplicación si no se conecta a la BD
  });

// --- Definir modelo Usuario ---
const usuarioSchema = new mongoose.Schema({
  usuario: { type: String, required: true, unique: true },
  correo: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  admin: { type: Boolean, default: false }
});

const Usuario = mongoose.model("Usuario", usuarioSchema);

// --- Rutas ---

// Ruta de registro
app.post("/registroUsuario", async (req, res) => {
  const { usuario, correo, password } = req.body;

  try {
    const existe = await Usuario.findOne({ usuario });
    if (existe) {
      return res.status(400).send("El usuario ya existe 🚫");
    }

    const nuevo = new Usuario({ usuario, correo, password });
    await nuevo.save();

    res.status(201).send("Usuario registrado ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en el servidor: " + err.message);
  }
});

// Ruta de login
app.post("/login", async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const encontrado = await Usuario.findOne({ usuario });
    if (!encontrado || encontrado.password !== password) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos 🚫" });
    }

    // Usa una variable de entorno para el secreto de JWT
    const token = jwt.sign(
      { usuario: encontrado.usuario, admin: encontrado.admin },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      usuario: encontrado.usuario,
      admin: encontrado.admin,
      token,
      message: "Bienvenido " + encontrado.usuario
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error en el servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));