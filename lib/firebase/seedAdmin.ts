/**
 * Script para crear el primer usuario administrador.
 * Ejecutar desde la consola de Firebase o desde un script Node temporal.
 * 
 * USO:
 *   1. Ve a Firebase Console > Authentication > Usuarios > Añadir usuario
 *   2. Crea el usuario con email y password
 *   3. Copia el UID que genera Firebase
 *   4. Ve a Firestore > Colección "users" > Añadir documento con ese UID
 *   5. Agrega los campos:
 *      - nombre: "Tu Nombre"
 *      - email: "tu@email.com"
 *      - rol: "admin"
 *      - activo: true
 *      - createdAt: (timestamp actual)
 */

export const SEED_INSTRUCTIONS = `
Para crear el primer administrador:
1. Firebase Console → Authentication → Add user (email + password)
2. Copia el UID generado
3. Firestore → Colección "users" → Documento con ID = ese UID
4. Campos:
   {
     nombre: "Nombre Completo",
     email: "admin@empresa.com",
     rol: "admin",
     activo: true,
     createdAt: <timestamp>
   }
`;