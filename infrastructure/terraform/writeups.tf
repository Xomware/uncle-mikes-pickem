# pickem-writeups asks Claude Haiku for a ~120-word preview of each game
# (F12.3, common/writeup.py): Wednesday 10:00 ET for the week's games, and a
# Saturday 10:00 ET refresh that rewrites only games whose facts changed.
# {"force": true, "season": 2026, "week": 12} invoked by hand rewrites a week.

locals {
  writeups_name = "${var.app_name}-writeups"

  writeups_schedules = {
    wednesday = "cron(0 10 ? * WED *)"
    saturday  = "cron(0 10 ? * SAT *)"
  }
}

# Under the AWS-managed aws/ssm key, like the email secrets, so the plan role
# can read it on refresh.
resource "aws_ssm_parameter" "anthropic_api_key" {
  name   = "/${var.app_name}/anthropic-api-key"
  type   = "SecureString"
  key_id = "alias/aws/ssm"
  value  = var.anthropic_api_key
}

resource "aws_cloudwatch_log_group" "writeups" {
  name              = "/aws/lambda/${local.writeups_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "writeups" {
  name               = "${local.writeups_name}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "writeups" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.writeups.arn}:*"]
  }

  # CURRENT, the week's GAMEs, the INFO#live cache (common/game_view.py) and WRITEUP items.
  statement {
    sid       = "Nfl"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.nfl.arn]
  }

  statement {
    sid       = "AnthropicKey"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.anthropic_api_key.arn]
  }

  # aws/ssm is AWS-managed, so its key id isn't known here without another
  # lookup. The ViaService condition limits the decrypt to SSM calls.
  statement {
    sid       = "AnthropicKeyDecrypt"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.aws_region}:${local.account_id}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "writeups" {
  name   = "writeups"
  role   = aws_iam_role.writeups.id
  policy = data.aws_iam_policy_document.writeups.json
}

resource "aws_lambda_function" "writeups" {
  # Folder lambdas/writeups.
  function_name = local.writeups_name
  role          = aws_iam_role.writeups.arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 512
  timeout       = 300 # ~16 games, each an ESPN fetch, an nflverse fetch and a model call
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment {
    variables = {
      NFL_TABLE           = aws_dynamodb_table.nfl.id
      ANTHROPIC_KEY_PARAM = aws_ssm_parameter.anthropic_api_key.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.writeups]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}

resource "aws_iam_role" "writeups_scheduler" {
  name               = "${local.writeups_name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "writeups_scheduler" {
  statement {
    sid       = "InvokeWriteups"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.writeups.arn]
  }
}

resource "aws_iam_role_policy" "writeups_scheduler" {
  name   = "invoke-writeups"
  role   = aws_iam_role.writeups_scheduler.id
  policy = data.aws_iam_policy_document.writeups_scheduler.json
}

resource "aws_scheduler_schedule" "writeups" {
  for_each                     = local.writeups_schedules
  name                         = "${local.writeups_name}-${each.key}"
  schedule_expression          = each.value
  schedule_expression_timezone = "America/New_York"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.writeups.arn
    role_arn = aws_iam_role.writeups_scheduler.arn
    input    = jsonencode({})

    # A rerun skips games already written, so a retry costs nothing.
    retry_policy {
      maximum_retry_attempts = 1
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "writeups_errors" {
  alarm_name          = "${local.writeups_name}-errors"
  alarm_description   = "writeups failed. The game page's Film Room is missing or stale this week."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.writeups.function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
