create table public.batch_mints
(
    block_number  bigint,
    error_message text,
    created_at    timestamp   default now()                        not null,
    mint_count    integer                                          not null,
    id            uuid        default gen_random_uuid()            not null
        primary key,
    batch_tx_hash varchar(66)                                      not null
        unique,
    gas_used      bigint,
    status        varchar(20) default 'pending'::character varying not null,
    confirmed_at  timestamp
);

alter table public.batch_mints
    owner to postgres;

create table public.deployed_tokens
(
    website_url               text,
    mint_count                integer     default 0,
    name                      varchar(255)                          not null,
    lp_retry_count            integer     default 0,
    deploy_block_number       bigint,
    position_manager          varchar(42),
    deploy_tx_hash            varchar(66),
    payment_seed              varchar(78),
    payment_token_address     varchar(42)                           not null,
    max_supply                varchar(78),
    description               text,
    lp_deployer_address       varchar(42),
    address                   varchar(42)                           not null
        unique,
    is_active                 boolean     default true,
    pool_manager              varchar(42),
    pool_fee                  integer     default 10000,
    updated_at                timestamp   default now()             not null,
    verified                  boolean     default false,
    max_mint_count            integer                               not null,
    deployer_address          varchar(42)                           not null,
    liquidity_deployed        boolean     default false,
    payment_token_symbol      varchar(10)                           not null,
    symbol                    varchar(50)                           not null,
    lp_token_id               varchar(100),
    sqrt_price_token_first    varchar(78),
    lp_deployment_error_at    timestamp,
    liquidity_deployed_at     timestamp,
    mint_amount               varchar(78)                           not null,
    lp_deployment_error       text,
    sqrt_price_payment_first  varchar(78),
    logo_url                  text,
    liquidity_tx_hash         varchar(66),
    id                        uuid        default gen_random_uuid() not null
        primary key,
    pool_seed_amount          varchar(78),
    price                     varchar(78)                           not null,
    created_at                timestamp   default now()             not null,
    total_supply              varchar(78) default '0'::character varying,
    permit2                   varchar(42),
    pool_tick_spacing         integer     default 200,
    network                   varchar(20)                           not null,
    constructor_args          jsonb,
    compiler_version          varchar(20) default '0.8.26'::character varying,
    optimization_runs         integer     default 200,
    via_ir                    boolean     default true,
    verification_status       varchar(20) default 'pending'::character varying,
    verification_guid         varchar(100),
    verified_at               timestamp,
    verification_error        text,
    verification_retry_count  integer     default 0,
    verification_last_attempt timestamp
);

comment on table public.deployed_tokens is 'Deployed tokens using Uniswap V3';

comment on column public.deployed_tokens.lp_retry_count is 'Number of times LP deployment has been retried';

comment on column public.deployed_tokens.position_manager is 'Uniswap V3 NonfungiblePositionManager address';

comment on column public.deployed_tokens.lp_deployer_address is 'Address that will receive tokens and USDC for LP deployment';

comment on column public.deployed_tokens.pool_fee is 'Uniswap V3 pool fee tier (3000 = 0.3%, 500 = 0.05%, 10000 = 1%)';

comment on column public.deployed_tokens.lp_token_id is 'Uniswap V3 NFT position token ID';

comment on column public.deployed_tokens.lp_deployment_error_at is 'Timestamp of last LP deployment error';

comment on column public.deployed_tokens.liquidity_deployed_at is 'Timestamp when liquidity was deployed';

comment on column public.deployed_tokens.lp_deployment_error is 'Last error message if LP deployment failed';

comment on column public.deployed_tokens.liquidity_tx_hash is 'Transaction hash of liquidity deployment';

comment on column public.deployed_tokens.pool_tick_spacing is 'Pool tick spacing (e.g., 200)';

comment on column public.deployed_tokens.constructor_args is 'JSON object containing all constructor arguments for contract verification';

comment on column public.deployed_tokens.verification_status is 'Status: pending, verifying, verified, failed';

comment on column public.deployed_tokens.verification_guid is 'Etherscan/Basescan verification GUID';

comment on column public.deployed_tokens.verification_error is 'Last error message from verification attempt';

comment on column public.deployed_tokens.verification_retry_count is 'Number of times verification has been attempted';

comment on column public.deployed_tokens.verification_last_attempt is 'Timestamp of last verification attempt';

alter table public.deployed_tokens
    owner to postgres;

create index idx_deployed_tokens_verification_status
    on public.deployed_tokens (verification_status);

create index idx_deployed_tokens_verification_retry
    on public.deployed_tokens (verification_status, verification_retry_count)
    where ((verification_status)::text = 'failed'::text);

create table public.mint_history
(
    tx_hash_bytes32 varchar(66)                         not null
        unique,
    mint_tx_hash    varchar(66)                         not null,
    token_address   varchar(42),
    payment_tx_hash varchar(66),
    block_number    bigint,
    id              uuid      default gen_random_uuid() not null
        primary key,
    amount          varchar(78)                         not null,
    payment_type    varchar(20)                         not null,
    completed_at    timestamp default now()             not null,
    payer_address   varchar(42)                         not null,
    created_at      timestamp default now()             not null
);

alter table public.mint_history
    owner to postgres;

create table public.mint_queue
(
    retry_count        integer     default 0,
    status             varchar(20) default 'pending'::character varying not null,
    created_at         timestamp   default now()                        not null,
    queue_position     integer,
    id                 uuid        default gen_random_uuid()            not null
        primary key,
    processed_at       timestamp,
    tx_hash_bytes32    varchar(66)                                      not null
        unique,
    mint_tx_hash       varchar(66),
    updated_at         timestamp   default now()                        not null,
    payment_tx_hash    varchar(66),
    authorization_data jsonb,
    payer_address      varchar(42)                                      not null,
    payment_type       varchar(20) default 'x402'::character varying    not null,
    token_address      varchar(42),
    error_message      text
);

alter table public.mint_queue
    owner to postgres;

create table public.system_settings
(
    description text,
    updated_at  timestamp default now() not null,
    value       text                    not null,
    key         varchar(100)            not null
        primary key
);

alter table public.system_settings
    owner to postgres;

