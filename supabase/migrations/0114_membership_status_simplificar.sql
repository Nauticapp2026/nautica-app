-- Simplificar estado de membership de socio a 2 valores: 'active' / 'inactivo'.
-- 'suspended' (Pausado) se retira de la UI; las membresías que estaban en ese
-- estado pasan a 'inactivo' (misma semántica: sin acceso). No se borra el valor
-- del enum 'membership_status' porque Postgres no permite DROP VALUE.
UPDATE public.memberships SET status = 'inactivo' WHERE status = 'suspended';
