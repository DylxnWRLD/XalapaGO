const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // ✅ Para encriptar
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// 🔑 Conectar a MongoDB Atlas
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch(err => {
    console.error("❌ Error de conexión a MongoDB Atlas:", err);
    process.exit(1);
  });

// --- Modelo Usuario ---
const usuarioSchema = new mongoose.Schema({
  usuario: { type: String, required: true, unique: true },
  correo: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  admin: { type: Boolean, default: false }
});

const Usuario = mongoose.model("Usuario", usuarioSchema);

// --- Validación de contraseña ---
function validarPassword(password) {
  // Ejemplo de requisitos:
  // - mínimo 8 caracteres
  // - al menos 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;
  return regex.test(password);
}

// 📌 Registro
app.post("/registroUsuario", async (req, res) => {
  const { usuario, correo, password } = req.body;

  try {
    if (!validarPassword(password)) {
      return res.status(400).send(
        "La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula, un número y un símbolo."
      );
    }

    const existe = await Usuario.findOne({ usuario });
    if (existe) {
      return res.status(400).send("El usuario ya existe 🚫");
    }

    // ✅ Encriptar contraseña antes de guardar
    const salt = await bcrypt.genSalt(10); // número de rondas (10 es seguro)
    const hashPassword = await bcrypt.hash(password, salt);

    const nuevo = new Usuario({ usuario, correo, password: hashPassword });
    await nuevo.save();

    res.status(201).send("Usuario registrado ✅");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en el servidor: " + err.message);
  }
});

// 📌 Login
app.post("/login", async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const encontrado = await Usuario.findOne({ usuario });
    if (!encontrado) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos 🚫" });
    }

    // ✅ Comparar la contraseña ingresada con el hash guardado
    const passwordValida = await bcrypt.compare(password, encontrado.password);
    if (!passwordValida) {
      return res.status(401).json({ message: "Usuario o contraseña incorrectos 🚫" });
    }

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

