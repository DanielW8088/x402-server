-- Script to migrate historical mint data to users table
-- This will:
-- 1. Create users for all existing payer addresses in mint_history
-- 2. Calculate and set their mint_count and points
-- 3. Handle any duplicates gracefully

BEGIN;

-- Insert all unique payer addresses from mint_history as new users
-- with their mint counts and points (1 point per mint)
INSERT INTO public.users (wallet_address, mint_count, points, invitation_code)
SELECT 
    payer_address as wallet_address,
    COUNT(*) as mint_count,
    COUNT(*) as points,  -- 1 point per mint
    generate_invitation_code() as invitation_code
FROM 
    public.mint_history
WHERE 
    payer_address IS NOT NULL
GROUP BY 
    payer_address
ON CONFLICT (wallet_address) DO UPDATE
SET 
    mint_count = users.mint_count + EXCLUDED.mint_count,
    points = users.points + EXCLUDED.points,
    updated_at = NOW();

-- Also include payer addresses from mint_queue that are completed
-- (in case there are any not in mint_history yet)
INSERT INTO public.users (wallet_address, invitation_code)
SELECT DISTINCT
    payer_address as wallet_address,
    generate_invitation_code() as invitation_code
FROM 
    public.mint_queue
WHERE 
    payer_address IS NOT NULL
    AND status = 'completed'
    AND payer_address NOT IN (SELECT wallet_address FROM public.users)
ON CONFLICT (wallet_address) DO NOTHING;

-- Display migration results
DO $$
DECLARE
    total_users INTEGER;
    total_points INTEGER;
    total_mints INTEGER;
BEGIN
    SELECT COUNT(*), SUM(points), SUM(mint_count) 
    INTO total_users, total_points, total_mints
    FROM public.users;
    
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Total users created: %', total_users;
    RAISE NOTICE 'Total points distributed: %', total_points;
    RAISE NOTICE 'Total mints recorded: %', total_mints;
END $$;

COMMIT;

-- Verify the migration
SELECT 
    wallet_address,
    invitation_code,
    mint_count,
    points,
    created_at
FROM 
    public.users
ORDER BY 
    points DESC
LIMIT 10;

