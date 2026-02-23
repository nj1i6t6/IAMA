-- Migration 0003: Subscription and billing tiers
-- Dependency: 0001 (users), 0002 (admin_accounts)

CREATE TABLE dynamic_configs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key   TEXT NOT NULL UNIQUE,
    config_value JSONB NOT NULL,
    scope        TEXT NOT NULL DEFAULT 'GLOBAL' CHECK (scope IN ('GLOBAL', 'ORG', 'USER')),
    scope_id     UUID,
    updated_by   UUID REFERENCES admin_accounts(id),
    reason       TEXT,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON dynamic_configs (config_key);

CREATE TABLE subscription_tiers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id),
    tier                    TEXT NOT NULL CHECK (tier IN ('FREE', 'PLUS', 'PRO', 'MAX', 'ENTERPRISE')),
    status                  TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL')),
    context_cap             INTEGER NOT NULL,
    operating_mode          TEXT NOT NULL CHECK (operating_mode IN ('SIMPLE', 'PROFESSIONAL', 'ENTERPRISE')),
    billing_cycle_start     TIMESTAMPTZ NOT NULL,
    billing_cycle_end       TIMESTAMPTZ NOT NULL,
    payment_gateway         TEXT,
    external_customer_id    TEXT,
    external_subscription_id TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON subscription_tiers (user_id);
CREATE INDEX ON subscription_tiers (external_subscription_id);

CREATE TABLE payment_subscriptions (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                   UUID NOT NULL REFERENCES users(id),
    gateway                   TEXT NOT NULL,
    external_subscription_id  TEXT NOT NULL UNIQUE,
    external_customer_id      TEXT NOT NULL,
    tier                      TEXT NOT NULL,
    status                    TEXT NOT NULL,
    current_period_start      TIMESTAMPTZ,
    current_period_end        TIMESTAMPTZ,
    cancelled_at              TIMESTAMPTZ,
    last_webhook_event_id     TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON payment_subscriptions (user_id);
CREATE INDEX ON payment_subscriptions (external_subscription_id);
CREATE INDEX ON payment_subscriptions (last_webhook_event_id);

-- Seed default dynamic_configs
INSERT INTO dynamic_configs (config_key, config_value, scope, reason) VALUES
    ('model.l1',              '{"model_id":"minimax/abab6.5s-chat","api_base_url":"https://api.minimax.chat/v1","api_key_ref":"secrets/litellm/minimax_api_key","output_token_limit":30000,"enabled":true}', 'GLOBAL', 'Initial seed'),
    ('model.l2',              '{"model_id":"anthropic/claude-sonnet-4-5","api_base_url":"https://api.anthropic.com","api_key_ref":"secrets/litellm/anthropic_api_key","output_token_limit":5000,"enabled":true}',  'GLOBAL', 'Initial seed'),
    ('model.l3',              '{"model_id":"anthropic/claude-opus-4-5","api_base_url":"https://api.anthropic.com","api_key_ref":"secrets/litellm/anthropic_api_key","output_token_limit":5000,"enabled":true}',   'GLOBAL', 'Initial seed'),
    ('tier_context_caps',     '{"FREE":128000,"PLUS":128000,"PRO":200000,"MAX":200000,"ENTERPRISE":1000000}',                                                                        'GLOBAL', 'Initial seed'),
    ('feature.black_box_orchestration',           'false',  'GLOBAL', 'Initial seed'),
    ('feature.cross_ecosystem_v1x',               'false',  'GLOBAL', 'Initial seed'),
    ('feature.enterprise_trial_provisioning',     'true',   'GLOBAL', 'Initial seed'),
    ('feature.baseline_ast_confidence_threshold', '40',     'GLOBAL', 'Initial seed'),
    ('system.kill_switch.global',                 'false',  'GLOBAL', 'Initial seed'),
    ('system.kill_switch.reason',                 '""',     'GLOBAL', 'Initial seed'),
    ('language_matrix',       '{"approved_pairs":[{"source":"python","target":"python","mode":"AST_SYMBOLIC"},{"source":"typescript","target":"typescript","mode":"AST_SYMBOLIC"}],"version":"1.0"}', 'GLOBAL', 'Initial seed')
ON CONFLICT (config_key) DO NOTHING;
