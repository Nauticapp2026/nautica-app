-- Add 'inactivo' to membership_status enum
-- Represents a member who left the club permanently (vs 'suspended' = temporarily away)
ALTER TYPE membership_status ADD VALUE IF NOT EXISTS 'inactivo';
