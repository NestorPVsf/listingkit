#!/usr/bin/env node
/**
 * Genera el hash de la contraseña de operador. NO escribe en ningun sitio:
 * imprime la linea para pegar en `.env`, porque un script que edita ficheros de
 * configuracion por su cuenta acaba pisando algo el dia menos pensado.
 *
 *   npm run set-password -- "la contraseña"
 *
 * Sin la contraseña como argumento la pide por teclado, que es lo preferible:
 * asi no queda en el historial del shell.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";
import { hashPassword } from "../lib/auth/operator-session.ts";

const MINIMO = 12;

async function pedirPassword() {
  const desdeArgumentos = argv.slice(2).join(" ").trim();
  if (desdeArgumentos.length > 0) return desdeArgumentos;

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question("Contraseña de operador: ")).trim();
  } finally {
    rl.close();
  }
}

const password = await pedirPassword();

if (password.length < MINIMO) {
  console.error(
    `\nDemasiado corta: minimo ${MINIMO} caracteres.\n` +
      "Es la unica llave de la instalacion; una frase de varias palabras va bien.\n",
  );
  exit(1);
}

console.log(
  "\nPega esta linea en tu .env (y no la subas al repositorio):\n\n" +
    `APP_PASSWORD_HASH="${hashPassword(password)}"\n\n` +
    "Al cambiarla, las sesiones abiertas dejan de valer automaticamente.\n",
);
