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
  death_lambdas = [
    { name = "entry", description = "Add a death pool entry for the caller or a member", path_part = "entry", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "pick", description = "Set a death pool entry's team for a week", path_part = "pick", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
    { name = "board", description = "Read a group's death pool grid and the open week (?id=)", path_part = "board", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
  ]

  payments_lambdas = [
    { name = "ledger", description = "Read what members owe and have paid, and the pots (?id=)", path_part = "ledger", http_method = "GET", authorization = "COGNITO_USER_POOLS" },
    { name = "mark", description = "Mark a member's fee paid or unpaid", path_part = "mark", http_method = "POST", authorization = "COGNITO_USER_POOLS" },
  ]

  all_api_lambdas = merge(
    { for l in local.me_lambdas : "me_${l.name}" => l },
    { for l in local.groups_lambdas : "groups_${l.name}" => l },
    { for l in local.invites_lambdas : "invites_${l.name}" => l },
    { for l in local.rules_lambdas : "rules_${l.name}" => l },
    { for l in local.members_lambdas : "members_${l.name}" => l },
    { for l in local.death_lambdas : "death_${l.name}" => l },
    { for l in local.payments_lambdas : "payments_${l.name}" => l },
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
    groups_create  = ["app:PutItem", "nfl:GetItem"]
    groups_mine    = ["app_index:Query"]
    groups_get     = ["app:Query", "nfl:GetItem"]
    invites_create = ["app:GetItem", "app:PutItem"]
    invites_accept = ["app:GetItem", "app:PutItem", "nfl:GetItem"]
    rules_update   = ["app:GetItem", "app:Query", "app:PutItem", "nfl:GetItem"]
    members_update = ["app:GetItem", "app:UpdateItem"]
    death_entry    = ["app:GetItem", "app:Query", "app:PutItem", "nfl:GetItem"]
    death_pick     = ["app:GetItem", "app:UpdateItem", "nfl:GetItem", "nfl:Query"]
    death_board    = ["app:Query", "nfl:GetItem", "nfl:Query"]

    payments_ledger = ["app:Query", "nfl:GetItem"]
    payments_mark   = ["app:GetItem", "app:PutItem"]
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
  for_each = local.all_api_lambdas

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

  environment { variables = local.lambda_variables }

  depends_on = [aws_cloudwatch_log_group.api]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}
