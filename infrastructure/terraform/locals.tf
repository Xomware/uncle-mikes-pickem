locals {
  standard_tags = {
    source      = "terraform"
    project     = var.app_name
    environment = var.environment
    owner       = "xomware"
  }

  account_id      = data.aws_caller_identity.current.account_id
  api_domain_name = "api.${var.domain_name}"

  # Comma-delimited. The first entry is the fallback for an origin that matches
  # none of them (common/api.py). Local dev matches the Cognito client's callbacks.
  cors_allowed_origins = "https://${var.domain_name},http://localhost:3000,http://127.0.0.1:3000"

  lambda_variables = {
    APP_NAME          = var.app_name
    CORS_ALLOW_ORIGIN = local.cors_allowed_origins
    NFL_TABLE         = aws_dynamodb_table.nfl.id
    APP_TABLE         = aws_dynamodb_table.app.id
    OPS_TABLE         = aws_dynamodb_table.ops.id
  }
}
