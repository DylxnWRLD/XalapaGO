<?php
session_start();

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $usuario = trim($_POST["usuario"]);
    $password = trim($_POST["password"]);

    $archivo = fopen("usuarios.txt", "r");
    $valido = false;

    if ($archivo) {
        while (($linea = fgets($archivo)) !== false) {
            list($u, $c, $p) = explode("|", trim($linea));
            if ($usuario === $u && $password === $p) {
                $valido = true;
                $_SESSION["usuario"] = $u;
                break;
            }
        }
        fclose($archivo);
    }

    if ($valido) {
        header("Location: ../index.html");
        exit();
    } else {
        echo "<script>
            alert('Usuario o contraseña incorrectos');
            window.history.back();
        </script>";
    }
}
?>
