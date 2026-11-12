# pickem-cron-tick keeps pickem-nfl's schedule, lines and hype current
# (BRAINSTORM.md 2A). It fires every 2 minutes and no-ops outside game windows
# and the hourly refresh, so most invocations cost a read and nothing else.

locals {
  cron_tick_name = "${var.app_name}-cron-tick"
}

resource "aws_cloudwatch_log_group" "cron_tick" {
  name              = "/aws/lambda/${local.cron_tick_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "cron_tick" {
  name               = "${local.cron_tick_name}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "cron_tick" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.cron_tick.arn}:*"]
  }

  # Sole writer of pickem-nfl (common/nfl_store.py).
  statement {
    sid       = "Nfl"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.nfl.arn]
  }

  statement {
    sid       = "PollRuns"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.ops.arn]
  }
}

resource "aws_iam_role_policy" "cron_tick" {
  name   = "cron-tick"
  role   = aws_iam_role.cron_tick.id
  policy = data.aws_iam_policy_document.cron_tick.json
}

resource "aws_lambda_function" "cron_tick" {
  # Folder lambdas/cron_tick.
  function_name = local.cron_tick_name
  role          = aws_iam_role.cron_tick.arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 256
  timeout       = 60
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment {
    variables = {
      NFL_TABLE = aws_dynamodb_table.nfl.id
      OPS_TABLE = aws_dynamodb_table.ops.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.cron_tick]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}

resource "aws_iam_role" "cron_tick_scheduler" {
  name               = "${local.cron_tick_name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "cron_tick_scheduler" {
  statement {
    sid       = "InvokeCronTick"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.cron_tick.arn]
  }
}

resource "aws_iam_role_policy" "cron_tick_scheduler" {
  name   = "invoke-cron-tick"
  role   = aws_iam_role.cron_tick_scheduler.id
  policy = data.aws_iam_policy_document.cron_tick_scheduler.json
}

resource "aws_scheduler_schedule" "cron_tick" {
  name                = local.cron_tick_name
  schedule_expression = "rate(2 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.cron_tick.arn
    role_arn = aws_iam_role.cron_tick_scheduler.arn

    # The next tick is 2 minutes away; a retry would only overlap it.
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

# A stale cron_tick means a stale lockAt. One ESPN blip shouldn't page;
# an hour of failures should.
resource "aws_cloudwatch_metric_alarm" "cron_tick_errors" {
  alarm_name          = "${local.cron_tick_name}-errors"
  alarm_description   = "cron_tick failed 5+ times in an hour. WEEK lockAt and GAME status are going stale."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.cron_tick.function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
