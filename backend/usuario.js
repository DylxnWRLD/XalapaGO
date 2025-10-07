/**
 * Modelo de datos para usuarios en MongoDB usando Mongoose.
 * Incluye campos para nombre usuario, correo y contraseña.
 */
const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema({
  usuario: { type: String, required: true, unique: true },
  correo: { type: String, required: true },
  password: { type: String, required: true }
});

module.exports = mongoose.model("Usuario", usuarioSchema);
