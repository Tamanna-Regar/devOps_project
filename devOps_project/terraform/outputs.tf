output "server_public_ip" {
  description = "Static Elastic Public IP address of the DevOps server"
  value       = aws_eip.server_eip.public_ip
}

output "server_instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.server.id
}

output "vpc_id" {
  description = "Dedicated VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "Public Subnet ID where the server is deployed"
  value       = aws_subnet.public.id
}

output "security_group_id" {
  description = "Application Security Group ID"
  value       = aws_security_group.app_server_sg.id
}

output "ssh_command" {
  description = "Command to SSH into the provisioned server"
  value       = "ssh -i <path-to-your-private-key.pem> ubuntu@${aws_eip.server_eip.public_ip}"
}

output "application_url" {
  description = "HTTP access URL for the application"
  value       = "http://${aws_eip.server_eip.public_ip}"
}

output "cloudwatch_log_directory" {
  description = "Log directory on the server configured for CloudWatch streaming"
  value       = "/var/log/devops"
}
