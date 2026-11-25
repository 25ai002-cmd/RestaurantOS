-- RestaurantOS PostgreSQL Row-Level Security (RLS) Policy Foundation
-- Apply after Prisma initial migration to enforce database-level tenant isolation.
-- Connection transactions set `SET LOCAL app.current_restaurant_id = '<uuid>'` via withTenantScope().

DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'restaurant_domains',
    'subscriptions',
    'subscription_invoices',
    'branches',
    'restaurant_users',
    'restaurant_tables',
    'customers',
    'customer_sessions',
    'table_sessions',
    'table_session_customers',
    'categories',
    'products',
    'product_variants',
    'product_addons',
    'carts',
    'cart_items',
    'orders',
    'order_items',
    'order_status_history',
    'kitchen_tickets',
    'bills',
    'bill_orders',
    'payments',
    'payment_events',
    'refunds',
    'feedback',
    'feedback_templates',
    'notifications',
    'file_uploads'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy ON %I USING (restaurant_id::text = current_setting(''app.current_restaurant_id'', true)) WITH CHECK (restaurant_id::text = current_setting(''app.current_restaurant_id'', true));',
      tbl
    );
  END LOOP;
END $$;
