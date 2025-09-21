const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Conectar a MongoDB
mongoose.connect("mongodb://localhost:27017/XalapaGO", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ Conectado a MongoDB"))
  .catch(err => console.error("❌ Error:", err));

// --- Definir modelo Usuario directamente ---
const usuarioSchema = new mongoose.Schema({
  usuario: { type: String, required: true, unique: true },
  correo: { type: String, required: true },
  password: { type: String, required: true },
  admin: { type: Boolean, default: false } // opcional
});

const Usuario = mongoose.model("Usuario", usuarioSchema);

// Ruta para registrar usuario
app.post("/registroUsuario", async (req, res) => {
  const { usuario, correo, password } = req.body;

  try {
    const existe = await Usuario.findOne({ usuario });
    if (existe) return res.status(400).send("El usuario ya existe 🚫");

    const nuevo = new Usuario({ usuario, correo, password });
    await nuevo.save();

    res.send("Usuario registrado ✅");
  } catch (err) {
    res.status(500).send("Error en el servidor");
  }
});

const jwt = require("jsonwebtoken");

app.post("/login", async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const encontrado = await Usuario.findOne({ usuario });
    if (!encontrado || encontrado.password !== password) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos 🚫" });
    }

    // Crear token JWT
    const token = jwt.sign(
      { usuario: encontrado.usuario, admin: encontrado.admin },
      "mi_secreto_super_seguro", // tu secreto para firmar
      { expiresIn: "1h" } // dura 1 hora
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






app.listen(3000, () => console.log("🚀 Servidor corriendo en http://localhost:3000"));
