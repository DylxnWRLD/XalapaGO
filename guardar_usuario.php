<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $usuario = trim($_POST["usuario"]);
    $password = trim($_POST["password"]);

    if (!empty($usuario) && !empty($password)) {
        $linea = $usuario . ":" . $password . PHP_EOL;

        // Guarda en usuarios.txt sin mostrarlo ni descargarlo
        file_put_contents("XalapaGO/usuarios.txt", $linea, FILE_APPEND | LOCK_EX);

        // Redirige al login con un aviso
        echo "<script>
            alert('Usuario registrado con éxito');
            window.location.href='login.html';
        </script>";
    } else {
        echo "<script>
            alert('Por favor llena todos los campos');
            window.history.back();
        </script>";
    }
}
?>

