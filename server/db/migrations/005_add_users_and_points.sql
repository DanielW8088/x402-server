-- Create users table for user management, invitation system, and points
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    invitation_code VARCHAR(10) NOT NULL UNIQUE,
    invited_by_code VARCHAR(10),
    invited_by_wallet VARCHAR(42),
    mint_count INTEGER DEFAULT 0 NOT NULL,
    points INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
    
    CONSTRAINT fk_invited_by_wallet 
        FOREIGN KEY (invited_by_wallet) 
        REFERENCES public.users(wallet_address)
        ON UPDATE CASCADE ON DELETE SET NULL
);

COMMENT ON TABLE public.users IS 'User information including wallet address, invitation code, and points';
COMMENT ON COLUMN public.users.wallet_address IS 'User wallet address (unique identifier)';
COMMENT ON COLUMN public.users.invitation_code IS 'Unique invitation code generated for this user';
COMMENT ON COLUMN public.users.invited_by_code IS 'Invitation code used by this user (can only be set once)';
COMMENT ON COLUMN public.users.invited_by_wallet IS 'Wallet address of the user who invited this user';
COMMENT ON COLUMN public.users.mint_count IS 'Total number of mints by this user';
COMMENT ON COLUMN public.users.points IS 'User points (1 point per mint)';

-- Create indexes for better query performance
CREATE INDEX idx_users_wallet ON public.users(wallet_address);
CREATE INDEX idx_users_invitation_code ON public.users(invitation_code);
CREATE INDEX idx_users_invited_by_wallet ON public.users(invited_by_wallet);
CREATE INDEX idx_users_points ON public.users(points DESC);

-- Function to generate unique invitation code
CREATE OR REPLACE FUNCTION generate_invitation_code() RETURNS VARCHAR(10) AS $$
DECLARE
    code VARCHAR(10);
    code_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 8-character alphanumeric code (uppercase)
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));
        
        -- Check if code exists
        SELECT EXISTS(SELECT 1 FROM public.users WHERE invitation_code = code) INTO code_exists;
        
        -- Exit loop if unique
        EXIT WHEN NOT code_exists;
    END LOOP;
    
    RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically generate invitation code on insert if not provided
CREATE OR REPLACE FUNCTION set_invitation_code() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.invitation_code IS NULL OR NEW.invitation_code = '' THEN
        NEW.invitation_code := generate_invitation_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_invitation_code
    BEFORE INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION set_invitation_code();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
