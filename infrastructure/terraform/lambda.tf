# API Lambdas. The api-gateway-service module supports exactly two path levels,
# /<prefix>/<part>, so ids travel in the body or query string.

locals {
  me_lambdas = [
    { name = "profile", description = "Upsert and return the caller's profile from the ID token", path_part = "profile", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  groups_lambdas = [
    { name = "create", description = "Create a group with the caller as owner", path_part = "create", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "mine", description = "List the caller's groups", path_part = "mine", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "get", description = "Read one group and its members (?id=)", path_part = "get", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  invites_lambdas = [
    { name = "create", description = "Create an invite code for a group", path_part = "create", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "accept", description = "Join a group with an invite code", path_part = "accept", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]
  rules_lambdas = [
    { name = "update", description = "Write a new versioned rules item for a group", path_part = "update", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]
  members_lambdas = [
    { name = "update", description = "Change a member's entry type or role", path_part = "update", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]
  picks_lambdas = [
    { name = "set", description = "Save the caller's picks for a week", path_part = "set", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "get", description = "Read a week's games, GOW and visible picks (?groupId=&week=)", path_part = "get", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  games_lambdas = [
    { name = "cancel", description = "Void or restore a game for a group's week", path_part = "cancel", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "info", description = "Read one game's line, form, injuries, weather and head-to-head (?groupId=&gameId=)", path_part = "info", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  # peek and confirm are public: the signed token in the admin email is their only credential.
  gow_lambdas = [
    { name = "set", description = "Choose a group's game of the week", path_part = "set", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "peek", description = "Show the game a signed GOW email link names (?t=)", path_part = "peek", http_method = "GET", authorization = "NONE" },
    { name = "confirm", description = "Choose the game a signed GOW email link names", path_part = "confirm", http_method = "POST", authorization = "NONE" },
  ]
  death_lambdas = [
    { name = "entry", description = "Add a death pool entry for the caller or a member", path_part = "entry", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "pick", description = "Set a death pool entry's team for a week", path_part = "pick", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "board", description = "Read a group's death pool grid and the open week (?id=)", path_part = "board", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]

  payments_lambdas = [
    { name = "ledger", description = "Read what members owe and have paid, and the pots (?id=)", path_part = "ledger", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "mark", description = "Mark a member's fee paid or unpaid", path_part = "mark", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "payouts", description = "Read each pot's winners and payouts (?id=)", path_part = "payouts", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "payout_mark", description = "Mark a winner's payout sent or unsent", path_part = "payout-mark", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]
  # Override and cancel are inputs: each regrades the week and refolds the season (common/results.py).
  results_lambdas = [
    { name = "override", description = "Set or clear a game's final score for a group, then regrade", path_part = "override", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "regrade", description = "Regrade one week or every locked week for a group", path_part = "regrade", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "week", description = "Read a group-week's graded results (?groupId=&week=)", path_part = "week", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  standings_lambdas = [
    { name = "season", description = "Read a group's season standings (?id=)", path_part = "season", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  analytics_lambdas = [
    { name = "week", description = "Read a group-week's win odds and rooting guide (?groupId=&week=)", path_part = "week", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "season", description = "Read a group's season win odds (?id=)", path_part = "season", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]
  replay_lambdas = [
    { name = "advance", description = "Move a replay group's virtual clock", path_part = "advance", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]
  # The module gives each path one method, so prefs reads and writes are two paths.
  # unsubscribe is public: the signed token in the link is its only credential.
  email_lambdas = [
    { name = "prefs", description = "Read the caller's email preferences in every group", path_part = "prefs", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "prefs_set", description = "Change the caller's email preferences in one group", path_part = "prefs-set", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "unsubscribe", description = "Unsubscribe from email by signed token", path_part = "unsubscribe", http_method = "ANY", authorization = "NONE" },
    { name = "preview", description = "Render an email template with sample data (?id=&template=)", path_part = "preview", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "test", description = "Send the test email to the caller", path_part = "test", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]

  config_lambdas = [
    { name = "flags", description = "Read the resolved feature flags, global or for a group (?groupId=)", path_part = "flags", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]

  # Every /super route 404s unless the caller is on the super admin list (common/superadmin.py).
  super_lambdas = [
    { name = "overview", description = "Super admin: counts, job health and mail volume", path_part = "overview", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "groups", description = "Super admin: list every group", path_part = "groups", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "group", description = "Super admin: read any group (?id=)", path_part = "group", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "users", description = "Super admin: everyone who has signed in", path_part = "users", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "flags", description = "Super admin: flag defaults and stored overrides", path_part = "flags", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "emails", description = "Super admin: recent mail claims and events (?groupId=)", path_part = "emails", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "flags_set", description = "Super admin: change global or group flags", path_part = "flags-set", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "regrade", description = "Super admin: regrade any group", path_part = "regrade", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "cron", description = "Super admin: start a scheduled job now", path_part = "cron", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]

  all_api_lambdas = merge(
    { for l in local.me_lambdas : "me_${l.name}" => l },
    { for l in local.groups_lambdas : "groups_${l.name}" => l },
    { for l in local.invites_lambdas : "invites_${l.name}" => l },
    { for l in local.rules_lambdas : "rules_${l.name}" => l },
    { for l in local.members_lambdas : "members_${l.name}" => l },
    { for l in local.gow_lambdas : "gow_${l.name}" => l },
    { for l in local.picks_lambdas : "picks_${l.name}" => l },
    { for l in local.games_lambdas : "games_${l.name}" => l },
    { for l in local.death_lambdas : "death_${l.name}" => l },
    { for l in local.payments_lambdas : "payments_${l.name}" => l },
    { for l in local.replay_lambdas : "replay_${l.name}" => l },
    { for l in local.results_lambdas : "results_${l.name}" => l },
    { for l in local.standings_lambdas : "standings_${l.name}" => l },
    { for l in local.analytics_lambdas : "analytics_${l.name}" => l },
    { for l in local.email_lambdas : "email_${l.name}" => l },
    { for l in local.config_lambdas : "config_${l.name}" => l },
    { for l in local.super_lambdas : "super_${l.name}" => l },
  )

  # One role per function, granted only the table actions its handler makes.
  # TransactWriteItems is authorized per item, as PutItem or UpdateItem.
  api_tables = {
    nfl       = aws_dynamodb_table.nfl.arn
    app       = aws_dynamodb_table.app.arn
    app_index = "${aws_dynamodb_table.app.arn}/index/*"
    ops       = aws_dynamodb_table.ops.arn
  }
  # One line per key: merge conflicts here are resolved by keeping both lines.
  api_grants = {
    me_profile     = ["app:UpdateItem"]
    groups_create  = ["app:GetItem", "app:PutItem", "nfl:GetItem"]
    groups_mine    = ["app_index:Query"]
    groups_get     = ["app:Query", "nfl:GetItem"]
    invites_create = ["app:GetItem", "app:PutItem"]
    invites_accept = ["app:GetItem", "app:PutItem", "nfl:GetItem"]
    rules_update   = ["app:GetItem", "app:Query", "app:PutItem", "nfl:GetItem"]
    members_update = ["app:GetItem", "app:UpdateItem"]
    gow_set        = ["app:GetItem", "app:PutItem", "nfl:GetItem"]
    gow_peek       = ["app:GetItem", "nfl:GetItem", "nfl:Query", "ops:GetItem"]
    gow_confirm    = ["app:GetItem", "app:PutItem", "nfl:GetItem", "ops:PutItem"]
    picks_set      = ["app:GetItem", "app:PutItem", "nfl:GetItem", "nfl:Query"]
    picks_get      = ["app:Query", "nfl:GetItem", "nfl:Query"]
    games_cancel   = ["app:GetItem", "app:Query", "app:PutItem", "app:UpdateItem", "nfl:GetItem", "nfl:Query", "ops:PutItem"]
    games_info     = ["app:GetItem", "nfl:BatchGetItem", "nfl:GetItem", "nfl:PutItem"]
    death_entry    = ["app:GetItem", "app:Query", "app:PutItem", "nfl:GetItem"]
    death_pick     = ["app:GetItem", "app:UpdateItem", "nfl:GetItem", "nfl:Query"]
    death_board    = ["app:GetItem", "app:Query", "nfl:GetItem", "nfl:Query"]

    payments_ledger      = ["app:GetItem", "app:Query", "nfl:GetItem"]
    payments_mark        = ["app:GetItem", "app:PutItem"]
    payments_payouts     = ["app:GetItem", "app:Query", "nfl:GetItem"]
    payments_payout_mark = ["app:GetItem", "app:Query", "app:PutItem", "nfl:GetItem"]
    replay_advance       = ["app:GetItem", "app:UpdateItem"]

    results_override = ["app:GetItem", "app:Query", "app:PutItem", "app:DeleteItem", "app:UpdateItem", "nfl:GetItem", "nfl:Query", "ops:PutItem"]
    results_regrade  = ["app:GetItem", "app:Query", "app:PutItem", "app:UpdateItem", "nfl:GetItem", "nfl:Query", "ops:PutItem"]
    results_week     = ["app:GetItem", "app:Query"]
    standings_season = ["app:GetItem", "app:Query"]
    analytics_week   = ["app:GetItem", "app:Query"]
    analytics_season = ["app:GetItem", "app:Query"]

    email_prefs       = ["app_index:Query", "ops:GetItem"]
    email_prefs_set   = ["app:GetItem", "app:UpdateItem"]
    email_unsubscribe = ["app:GetItem", "app:UpdateItem"]
    email_preview     = ["app:GetItem"]
    email_test        = ["app:GetItem"]

    config_flags = ["app:GetItem"]

    super_overview  = ["app:Scan", "app:Query", "nfl:GetItem", "nfl:Query", "ops:Query", "ops:Scan"]
    super_groups    = ["app:Scan"]
    super_group     = ["app:GetItem", "app:Query", "nfl:GetItem"]
    super_users     = ["app:Scan"]
    super_flags     = ["app:Scan"]
    super_emails    = ["ops:Query", "ops:Scan"]
    super_flags_set = ["app:GetItem", "app:PutItem", "ops:PutItem"]
    super_regrade   = ["app:GetItem", "app:Query", "app:PutItem", "app:UpdateItem", "nfl:GetItem", "nfl:Query", "ops:PutItem"]
    super_cron      = ["ops:PutItem"]
  }

  # Beyond table actions: policy documents from ses.tf and capture.tf. One line per key.
  api_policies = {
    games_info        = [data.aws_iam_policy_document.capture_read.json]
    email_unsubscribe = [data.aws_iam_policy_document.unsubscribe_key.json]
    email_preview     = [data.aws_iam_policy_document.unsubscribe_key.json]
    email_test        = [data.aws_iam_policy_document.unsubscribe_key.json, data.aws_iam_policy_document.send_email.json]
    gow_peek          = [data.aws_iam_policy_document.gow_link_key.json]
    gow_confirm       = [data.aws_iam_policy_document.gow_link_key.json]
    groups_create     = [data.aws_iam_policy_document.super_admin_read.json]
    super_overview    = [data.aws_iam_policy_document.super_admin_read.json]
    super_groups      = [data.aws_iam_policy_document.super_admin_read.json]
    super_group       = [data.aws_iam_policy_document.super_admin_read.json]
    super_users       = [data.aws_iam_policy_document.super_admin_read.json]
    super_flags       = [data.aws_iam_policy_document.super_admin_read.json]
    super_emails      = [data.aws_iam_policy_document.super_admin_read.json]
    super_flags_set   = [data.aws_iam_policy_document.super_admin_read.json]
    super_regrade     = [data.aws_iam_policy_document.super_admin_read.json]
    super_cron        = [data.aws_iam_policy_document.super_admin_read.json, data.aws_iam_policy_document.super_cron_invoke.json]
  }

  # Environment beyond lambda_variables. One line per key.
  api_env = {
    games_info        = { CAPTURE_BUCKET = aws_s3_bucket.capture.id }
    email_unsubscribe = local.email_env
    email_preview     = local.email_env
    email_test        = local.email_env
    gow_peek          = { GOW_LINK_PARAM = aws_ssm_parameter.gow_link_secret.name }
    gow_confirm       = { GOW_LINK_PARAM = aws_ssm_parameter.gow_link_secret.name }
  }
}

resource "aws_cloudwatch_log_group" "api" {
  for_each          = local.all_api_lambdas
  name              = "/aws/lambda/${var.app_name}-${replace(each.key, "_", "-")}"
  retention_in_days = 30
}

resource "aws_iam_role" "api" {
  for_each           = local.all_api_lambdas
  name               = "${var.app_name}-${replace(each.key, "_", "-")}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "api" {
  for_each                = local.all_api_lambdas
  source_policy_documents = try(local.api_policies[each.key], [])

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api[each.key].arn}:*"]
  }

  dynamic "statement" {
    for_each = lookup(local.api_grants, each.key, [])
    content {
      actions   = ["dynamodb:${split(":", statement.value)[1]}"]
      resources = [local.api_tables[split(":", statement.value)[0]]]
    }
  }
}

resource "aws_iam_role_policy" "api" {
  for_each = local.all_api_lambdas
  name     = "api"
  role     = aws_iam_role.api[each.key].id
  policy   = data.aws_iam_policy_document.api[each.key].json
}

resource "aws_lambda_function" "api" {
  for_each = local.all_api_lambdas

  # Folder lambdas/me_profile is function pickem-me-profile: deploy-backend.yml
  # maps every underscore to a dash.
  function_name = "${var.app_name}-${replace(each.key, "_", "-")}"
  description   = each.value.description
  role          = aws_iam_role.api[each.key].arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 1024 # CPU scales with memory; armchair saw ~2 s cold starts at 256 MB
  timeout       = 10
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment { variables = merge(local.lambda_variables, try(local.api_env[each.key], {})) }

  depends_on = [aws_cloudwatch_log_group.api]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}
