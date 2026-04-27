-- Agregar nuevo valor 'seguridad' al enum de roles.
-- Este rol es para personal de portería del club, que opera principalmente
-- desde la app mobile (escaneo de QR de socios e invitados al ingresar).
ALTER TYPE "rol" ADD VALUE IF NOT EXISTS 'seguridad';
