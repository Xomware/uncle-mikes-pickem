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

  all_api_lambdas = merge(
    { for l in local.me_lambdas : "me_${l.name}" => l },
    { for l in local.groups_lambdas : "groups_${l.name}" => l },
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
    me_profile    = ["app:UpdateItem"]
    groups_create = ["app:PutItem"]
    groups_mine   = ["app_index:Query"]
    groups_get    = ["app:Query"]
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
