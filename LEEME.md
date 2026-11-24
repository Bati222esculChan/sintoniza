# Sintoniza — cómo ponerla en marcha

Web de encuesta musical con cuentas (usuario + contraseña), perfil, amigos con % de compatibilidad,
playlists compartidas, buzón de canciones recomendadas y conexión con Spotify.

## 1. Firebase (cuentas y datos) — gratis

1. Entra a https://console.firebase.google.com y crea un proyecto (ej. `sintoniza`). Google Analytics no hace falta.
2. **Authentication → Comenzar → Método de acceso → Correo electrónico/contraseña → Habilitar.**
   (La app usa solo usuario y contraseña; por dentro crea un correo interno `usuario@usuarios.sintoniza.app`.)
3. **Firestore Database → Crear base de datos →** modo producción, la región más cercana.
4. En Firestore → **Reglas**, borra lo que haya, pega todo el contenido de `firestore.rules` y **Publicar**.
5. **Configuración del proyecto (engranaje) → Tus apps → icono `</>` (Web)** → registra la app.
   Copia los valores de `firebaseConfig` y pégalos en `firebase-config.js`.
6. Cuando tengas la web publicada: **Authentication → Configuración → Dominios autorizados →** agrega el dominio
   (ej. `tuusuario.github.io`).

## 2. Spotify (opcional)

1. Entra a https://developer.spotify.com/dashboard con tu cuenta de Spotify → **Create app**.
2. En **Redirect URIs** pon la dirección exacta de la web, con la barra final, por ejemplo:
   - publicada: `https://tuusuario.github.io/sintoniza/`
   - para probar en tu PC: `http://127.0.0.1:5178/`
3. Marca **Web API** y guarda. Copia el **Client ID** en `spotifyClientId` dentro de `firebase-config.js`.
4. Importante: mientras la app de Spotify esté en *Development mode*, solo pueden conectar Spotify las cuentas
   que agregues en **User Management** del dashboard. Para abrirla a todo el mundo hay que pedirle a Spotify la
   ampliación de cuota. El resto de la web (encuesta, amigos, playlists, buzón) funciona para cualquiera.

## 3. Probar en tu PC

```powershell
python -m http.server 5178 --bind 127.0.0.1
```
y abre http://127.0.0.1:5178/ (no funciona abriendo el archivo con doble clic).

## Qué guarda y quién lo ve

| Dato | Quién lo ve |
|---|---|
| Usuario, géneros, favoritas | Cualquier usuario con sesión |
| Correo | Solo tú |
| Historial de encuestas | Solo tú |
| Playlists | Solo sus miembros |
| Canciones recomendadas | Quien la envía y quien la recibe |

Sin correo real no hay "olvidé mi contraseña": si alguien la olvida, hay que crear otra cuenta.
