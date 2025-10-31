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
    mint_count                integer        default 0,
    name                      varchar(255)                             not null,
    lp_retry_count            integer        default 0,
    deploy_block_number       bigint,
    position_manager          varchar(42),
    deploy_tx_hash            varchar(66),
    payment_seed              varchar(78),
    payment_token_address     varchar(42)                              not null,
    max_supply                varchar(78),
    description               text,
    lp_deployer_address       varchar(42),
    address                   varchar(42)                              not null
        unique,
    is_active                 boolean        default true,
    pool_manager              varchar(42),
    pool_fee                  integer        default 10000,
    updated_at                timestamp      default now()             not null,
    verified                  boolean        default false,
    max_mint_count            integer                                  not null,
    deployer_address          varchar(42)                              not null,
    liquidity_deployed        boolean        default false,
    payment_token_symbol      varchar(10)                              not null,
    symbol                    varchar(50)                              not null,
    lp_token_id               varchar(100),
    sqrt_price_token_first    varchar(78),
    lp_deployment_error_at    timestamp,
    liquidity_deployed_at     timestamp,
    mint_amount               varchar(78)                              not null,
    lp_deployment_error       text,
    sqrt_price_payment_first  varchar(78),
    logo_url                  text,
    liquidity_tx_hash         varchar(66),
    id                        uuid           default gen_random_uuid() not null
        primary key,
    pool_seed_amount          varchar(78),
    price                     varchar(78)                              not null,
    created_at                timestamp      default now()             not null,
    total_supply              varchar(78)    default '0'::character varying,
    permit2                   varchar(42),
    pool_tick_spacing         integer        default 200,
    network                   varchar(20)                              not null,
    constructor_args          jsonb,
    compiler_version          varchar(20)    default '0.8.26'::character varying,
    optimization_runs         integer        default 200,
    via_ir                    boolean        default true,
    verification_status       varchar(20)    default 'pending'::character varying,
    verification_guid         varchar(100),
    verified_at               timestamp,
    verification_error        text,
    verification_retry_count  integer        default 0,
    verification_last_attempt timestamp,
    mint_count_24h_cache      integer        default 0,
    volume_24h_cache          numeric(20, 2) default 0,
    cache_updated_at          timestamp
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

comment on column public.deployed_tokens.mint_count_24h_cache is '缓存：最近24小时的mint次数（定期更新）';

comment on column public.deployed_tokens.volume_24h_cache is '缓存：最近24小时的USDC交易量（定期更新）';

comment on column public.deployed_tokens.cache_updated_at is '缓存字段最后更新时间';

alter table public.deployed_tokens
    owner to postgres;

create index idx_deployed_tokens_verification_status
    on public.deployed_tokens (verification_status);

create index idx_deployed_tokens_verification_retry
    on public.deployed_tokens (verification_status, verification_retry_count)
    where ((verification_status)::text = 'failed'::text);

create index idx_deployed_tokens_network_active
    on public.deployed_tokens (network asc, is_active asc, created_at desc)
    where (is_active = true);

comment on index public.idx_deployed_tokens_network_active is '支持按network过滤的token查询';

create index idx_deployed_tokens_deployer
    on public.deployed_tokens (deployer_address asc, created_at desc)
    where (is_active = true);

comment on index public.idx_deployed_tokens_deployer is '支持查询特定deployer的tokens';

create index idx_deployed_tokens_trending
    on public.deployed_tokens (network asc, is_active asc, volume_24h_cache desc)
    where (is_active = true);

comment on index public.idx_deployed_tokens_trending is '支持trending tokens按24h交易量排序';

create table public.mint_history
(
    tx_hash_bytes32 varchar(66)                         not null
        unique,
    mint_tx_hash    varchar(66)                         not null,
    token_address   varchar(42)
        constraint fk_mint_history_token
            references public.deployed_tokens (address)
            on update cascade on delete cascade,
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

comment on constraint fk_mint_history_token on public.mint_history is '确保mint历史记录关联到有效的token';

alter table public.mint_history
    owner to postgres;

create index idx_mint_history_token_completed
    on public.mint_history (token_address, completed_at) include (id);

comment on index public.idx_mint_history_token_completed is '覆盖索引，支持COUNT(id)而无需回表查询';

create index idx_mint_history_token_time
    on public.mint_history (token_address asc, completed_at desc);

comment on index public.idx_mint_history_token_time is '支持token的时间范围查询和24h统计';

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
    token_address      varchar(42)
        constraint fk_mint_queue_token
            references public.deployed_tokens (address)
            on update cascade on delete cascade,
    error_message      text
);

comment on constraint fk_mint_queue_token on public.mint_queue is '确保mint队列关联到有效的token';

alter table public.mint_queue
    owner to postgres;

create index idx_mint_queue_status_token
    on public.mint_queue (status, token_address, created_at)
    where ((status)::text = ANY ((ARRAY ['pending'::character varying, 'processing'::character varying])::text[]));

comment on index public.idx_mint_queue_status_token is '支持队列处理器的批量查询';

create index idx_mint_queue_token_status
    on public.mint_queue (token_address asc, status asc, created_at desc);

comment on index public.idx_mint_queue_token_status is '支持查询特定token的mint队列';

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

create table public.payment_queue
(
    id                    uuid        default gen_random_uuid()            not null
        primary key,
    payment_type          varchar(10)                                      not null
        constraint payment_queue_payment_type_check
            check ((payment_type)::text = ANY
                   ((ARRAY ['deploy'::character varying, 'mint'::character varying])::text[])),
    token_address         varchar(42),
    "authorization"       jsonb                                            not null,
    payer                 varchar(42)                                      not null,
    amount                varchar(100)                                     not null,
    payment_token_address varchar(42)                                      not null,
    metadata              jsonb,
    status                varchar(20) default 'pending'::character varying not null
        constraint payment_queue_status_check
            check ((status)::text = ANY
                   ((ARRAY ['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])),
    tx_hash               varchar(66),
    result                jsonb,
    error                 text,
    created_at            timestamp   default now(),
    processed_at          timestamp,
    constraint valid_token_address_for_mint
        check (((payment_type)::text <> 'mint'::text) OR (token_address IS NOT NULL))
);

comment on table public.payment_queue is 'Queue for serial processing of USDC payment transactions to prevent nonce conflicts';

alter table public.payment_queue
    owner to postgres;

create index idx_payment_queue_status_created
    on public.payment_queue (status, created_at)
    where ((status)::text = 'pending'::text);

create index idx_payment_queue_id
    on public.payment_queue (id);

create index idx_payment_queue_payer
    on public.payment_queue (payer);

create table public.mint_queue_backup_before_manual_complete
(
    retry_count        integer,
    status             varchar(20),
    created_at         timestamp,
    queue_position     integer,
    id                 uuid,
    processed_at       timestamp,
    tx_hash_bytes32    varchar(66),
    mint_tx_hash       varchar(66),
    updated_at         timestamp,
    payment_tx_hash    varchar(66),
    authorization_data jsonb,
    payer_address      varchar(42),
    payment_type       varchar(20),
    token_address      varchar(42),
    error_message      text
);

alter table public.mint_queue_backup_before_manual_complete
    owner to postgres;

