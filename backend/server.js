const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
app.use(express.json());
// 💡 CONFIGURACIÓN DE CORS
const corsOptions = {
    // ✅ CORRECCIÓN: SOLO EL DOMINIO PRINCIPAL
    origin: 'https://dylxnwrld.github.io', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // Si usas cookies/sesiones
};
app.use(cors(corsOptions));

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

// 📌 RUTA DE PRUEBA (HEALTH CHECK)
// Responde a la URL base de Render (https://xalapago-1.onrender.com/)
app.get("/", (req, res) => {
    res.status(200).send("Servidor API de XalapaGO está activo y funcionando. La API está disponible en rutas como /login y /obtenerAlertas.");
});

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
    const correoExiste = await Usuario.findOne({ correo });
    if (existe) {
      return res.status(400).send("El usuario ya existe 🚫");
    }
    if (correoExiste) {
      return res.status(400).send("El correo ya está registrado 🚫");
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


//Alertas
const alertaSchema = new mongoose.Schema({
  routeId: String,
  tipo: String,
});

const Alerta = mongoose.model("Alerta", alertaSchema);

// 📌 Agregar/Sincronizar Alerta (Ahora sin logs de éxito)
app.post("/agregarAlerta", async (req, res) => {
  try {
    const { routeAlerts } = req.body;

    // 1. Eliminar todas las alertas existentes en la colección
    await Alerta.deleteMany({});

    const rutasConAlerta = Object.keys(routeAlerts).length;

    if (rutasConAlerta > 0) {
      // 2. Crear el array de alertas a insertar solo si hay alguna
      const alertasArray = Object.entries(routeAlerts).map(([routeId, tipo]) => ({
        routeId,
        tipo
      }));

      // 3. Insertar las alertas enviadas por el cliente
      await Alerta.insertMany(alertasArray);
    }

    res.status(200).json({ ok: true, message: "Alertas guardadas" });

  } catch (err) {
    console.error("❌ Error al guardar alertas:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Obtener Alertas
app.get("/obtenerAlertas", async (req, res) => {
  try {
    // Encuentra todos los documentos en la colección Alerta
    const alertas = await Alerta.find({});

    res.status(200).json(alertas);
  } catch (err) {
    console.error("❌ Error al obtener alertas:", err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`));