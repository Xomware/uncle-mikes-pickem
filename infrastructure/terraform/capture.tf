# Raw ESPN archive for the 2026 replay. ESPN stops serving pre-game lines,
# injuries, weather and the predictor once a game is played, so anything this
# misses is gone for good. Nothing expires.

locals {
  capture_name = "${var.app_name}-capture"
}

resource "aws_s3_bucket" "capture" {
  bucket = "${var.app_name}-nfl-capture"
}

resource "aws_s3_bucket_public_access_block" "capture" {
  bucket                  = aws_s3_bucket.capture.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "capture" {
  bucket = aws_s3_bucket.capture.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudwatch_log_group" "capture" {
  name              = "/aws/lambda/${local.capture_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "capture" {
  name               = "${local.capture_name}-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "capture" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.capture.arn}:*"]
  }

  # Write-only, and only under raw/: the archive is append-only by construction.
  statement {
    sid       = "WriteRaw"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.capture.arn}/raw/*"]
  }
}

resource "aws_iam_role_policy" "capture" {
  name   = "capture"
  role   = aws_iam_role.capture.id
  policy = data.aws_iam_policy_document.capture.json
}

resource "aws_lambda_function" "capture" {
  # Folder lambdas/capture.
  function_name = local.capture_name
  role          = aws_iam_role.capture.arn
  handler       = "handler.handler"
  runtime       = var.lambda_runtime
  memory_size   = 256
  timeout       = 120
  layers        = [aws_lambda_layer_version.lambda_layer.arn]

  filename         = "./templates/lambda_stub.zip"
  source_code_hash = filebase64sha256("./templates/lambda_stub.zip")

  environment {
    variables = {
      CAPTURE_BUCKET = aws_s3_bucket.capture.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.capture]

  # Code ownership belongs to CI after the first apply.
  lifecycle {
    ignore_changes = [description, filename, source_code_hash, layers]
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.app_name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid       = "InvokeCapture"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.capture.arn]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "invoke-capture"
  role   = aws_iam_role.scheduler.id
  policy = data.aws_iam_policy_document.scheduler.json
}

# Every 30 minutes; the handler decides whether a tick is a daily snapshot, a
# pre-kickoff snapshot, or nothing. 30 gives one or two snapshots inside the
# 45-minute pre-kickoff window, after inactives are posted.
resource "aws_scheduler_schedule" "capture" {
  name                = local.capture_name
  schedule_expression = "rate(30 minutes)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.capture.arn
    role_arn = aws_iam_role.scheduler.arn

    retry_policy {
      maximum_retry_attempts = 0
    }
  }
}

resource "aws_sns_topic" "alarms" {
  name = "${var.app_name}-alarms"
}

resource "aws_sns_topic_subscription" "alarms_email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "capture_errors" {
  alarm_name          = "${local.capture_name}-errors"
  alarm_description   = "Capture failed a fetch or crashed. Missed snapshots cannot be refetched."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.capture.function_name }
  statistic           = "Sum"
  period              = 10800
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}

resource "aws_cloudwatch_metric_alarm" "capture_silent" {
  alarm_name          = "${local.capture_name}-silent"
  alarm_description   = "Capture has not run in 2 hours; the schedule or function is broken."
  namespace           = "AWS/Lambda"
  metric_name         = "Invocations"
  dimensions          = { FunctionName = aws_lambda_function.capture.function_name }
  statistic           = "Sum"
  period              = 7200
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
}
