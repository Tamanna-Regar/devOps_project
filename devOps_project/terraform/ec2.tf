# =========================================================
# LATEST UBUNTU 24.04 LTS AMI LOOKUP
# =========================================================

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical official AWS account ID

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# =========================================================
# SSH KEY PAIR
# =========================================================

resource "aws_key_pair" "generated" {
  count      = var.ssh_public_key != "" && var.ssh_key_name == "" ? 1 : 0
  key_name   = "${var.project_name}-${var.environment}-key"
  public_key = var.ssh_public_key

  tags = {
    Name = "${var.project_name}-${var.environment}-key"
  }
}

locals {
  key_name = var.ssh_key_name != "" ? var.ssh_key_name : (
    length(aws_key_pair.generated) > 0 ? aws_key_pair.generated[0].key_name : null
  )
}

# =========================================================
# EC2 INSTANCE (PRODUCTION APPLICATION SERVER)
# =========================================================

resource "aws_instance" "server" {
  ami                  = data.aws_ami.ubuntu.id
  instance_type        = var.instance_type
  subnet_id            = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app_server_sg.id]
  iam_instance_profile = aws_iam_instance_profile.ec2_profile.name
  key_name             = local.key_name

  user_data = file("${path.module}/user_data.sh")

  root_block_device {
    volume_size           = var.root_volume_size
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name = "${var.project_name}-${var.environment}-root-volume"
    }
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-server"
    Role = "AppServer"
  }
}

# =========================================================
# ELASTIC IP (Static Public IP for DNS & SSL)
# =========================================================

resource "aws_eip" "server_eip" {
  domain = "vpc"

  tags = {
    Name = "${var.project_name}-${var.environment}-eip"
  }
}

resource "aws_eip_association" "server_eip_assoc" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server_eip.id
}
