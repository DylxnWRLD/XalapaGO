document.addEventListener("DOMContentLoaded", () => {
  const authArea = document.getElementById("auth-area");
  authArea.innerHTML = ""; // Limpiar contenido

  const token = localStorage.getItem("token");

  /**
   * Crea un botón con texto, enlace y función onClick opcionales. 
   * @param {string} text 
   * @param {string|null} href 
   * @param {null} onClick 
   * @returns {HTMLButtonElement} botón creado
   */
  function createButton(text, href = null, onClick = null) {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.className = "auth-button";
    if (href) btn.onclick = () => location.href = href;
    if (onClick) btn.onclick = onClick;
    return btn;
  }

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));

      const userSpan = document.createElement("span");
      userSpan.textContent = payload.usuario;
      userSpan.className = "auth-username";
      authArea.appendChild(userSpan);

      // Si el usuario es admin, mostrar botón de registrar
      if (payload.admin) {
        const registerBtn = createButton("Registrar Usuario", "usuarios.html");
        authArea.appendChild(registerBtn);
      }

      const logoutBtn = createButton("Cerrar sesión", null, () => {
        localStorage.removeItem("token");
        location.reload();
      });
      authArea.appendChild(logoutBtn);

    } catch (err) {
      console.error("Token inválido:", err);
      localStorage.removeItem("token");
      location.reload();
    }

  } else {
    // Usuario no logueado: mostrar login y registro
    const loginBtn = createButton("Iniciar sesión", "InicioSesion/login.html");
    const registerBtn = createButton("Registrarse", "InicioSesion/registroUsuario.html");

    authArea.appendChild(loginBtn);
    authArea.appendChild(registerBtn);
  }
});
