# pickem-mail-sweep sends the email that is due: one per recipient for each
# EVENTS row grading writes (BRAINSTORM.md 3A). Its own function rather than a
# cron_tick hook, so an ESPN outage can't hold mail and only this role can send.

locals {
  mail_sweep_name = "${var.app_name}-mail-sweep"
}

resource "aws_cloudwatch_log_group" "mail_sweep" {
  name              = "/aws/lambda/${local.mail_sweep_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "mail_sweep" {
  name               = "${local.mail_sweep_name}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "mail_sweep" {
  source_policy_documents = [
    data.aws_iam_policy_document.unsubscribe_key.json,
    data.aws_iam_policy_document.send_email.json,
    data.aws_iam_policy_document.gow_link_key.json,
  ]

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.mail_sweep.arn}:*"]
  }

  # Members, profiles (addresses), RESULT, PICK and STANDINGS items; Scan finds groups for reminders.
  statement {
    sid       = "App"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:BatchGetItem", "dynamodb:Scan"]
    resources = [aws_dynamodb_table.app.arn]
  }

  # Weeks and games through the group's feed.
  statement {
    sid       = "Nfl"
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.nfl.arn]
  }

  # EVENTS and the cursor; MAIL# claims (put, release on a failed send); SUPPRESS reads.
  statement {
    sid       = "Ops"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.ops.arn]
  }
}

resource "aws_iam_role_policy" "mail_sweep" {
  name   = "mail-sweep"
  role   = aws_iam_role.mail_sweep.id
  policy = data.aws_iam_policy_document.mail_sweep.json
}

resource "aws_lambda_function" "mail_sweep" {
  # Folder lambdas/mail_sweep.
  function_name = local.mail_sweep_name
  role          = aws_iam_role.mail_sweep.arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 512
  timeout       = 120
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment {
    variables = merge(local.lambda_variables, local.email_env)
  }

  depends_on = [aws_cloudwatch_log_group.mail_sweep]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}

resource "aws_iam_role" "mail_sweep_scheduler" {
  name               = "${local.mail_sweep_name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "mail_sweep_scheduler" {
  statement {
    sid       = "InvokeMailSweep"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.mail_sweep.arn]
  }
}

resource "aws_iam_role_policy" "mail_sweep_scheduler" {
  name   = "invoke-mail-sweep"
  role   = aws_iam_role.mail_sweep_scheduler.id
  policy = data.aws_iam_policy_document.mail_sweep_scheduler.json
}

resource "aws_scheduler_schedule" "mail_sweep" {
  name                = local.mail_sweep_name
  schedule_expression = "rate(10 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.mail_sweep.arn
    role_arn = aws_iam_role.mail_sweep_scheduler.arn

    # The claims make a retry safe, but the next run is 10 minutes away anyway.
    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "mail_sweep_errors" {
  alarm_name          = "${local.mail_sweep_name}-errors"
  alarm_description   = "mail_sweep failed 3+ times in an hour. Result, reminder and GOW emails are not going out."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.mail_sweep.function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
