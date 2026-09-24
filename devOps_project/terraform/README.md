# 🏗️ Infrastructure as Code (Terraform) — DevOps Task Manager

This directory contains production-ready **Terraform** configuration to automatically provision and manage the complete AWS cloud infrastructure required to run the **DevOps Task Manager** application.

---

## 📐 Architecture Provisioned

```
                     AWS Cloud (Region: ap-south-1)
 ┌────────────────────────────────────────────────────────────────────────┐
 │  Dedicated VPC (10.0.0.0/16)                                            │
 │                                                                        │
 │   Internet Gateway (0.0.0.0/0)                                         │
 │      │                                                                 │
 │   Public Subnet (10.0.1.0/24)                                          │
 │      │                                                                 │
 │   Security Group (Ingress: 22, 80, 443, 9090, 3000 / Egress: All)      │
 │      │                                                                 │
 │   ┌────────────────────────────────────────────────────────────┐       │
 │   │  EC2 Instance (Ubuntu 24.04 LTS, gp3 30GB Encrypted)       │       │
 │   │  - IAM Profile: CloudWatchAgentServerPolicy + SES + SSM    │       │
 │   │  - Elastic IP (Static Public IP for DNS & SSL)             │       │
 │   │  - Bootstrap (Docker, Compose, AWS CLI, CloudWatch Agent)  │       │
 │   └────────────────────────────────────────────────────────────┘       │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

| File | Purpose |
| :--- | :--- |
| `versions.tf` | Defines minimum Terraform (`>= 1.5.0`) & AWS Provider (`~> 5.0`) versions. |
| `variables.tf` | Configurable input variables (region, instance type, CIDR blocks, keys). |
| `vpc.tf` | Dedicated VPC, Internet Gateway, Public Subnet, and Route Tables. |
| `security_groups.tf` | Firewall rules for SSH (22), HTTP (80), HTTPS (443), and Metrics (9090/3000). |
| `iam.tf` | IAM Role & Instance Profile for CloudWatch log streaming, SSM, and SES email. |
| `user_data.sh` | Bash bootstrap script installing Docker, Compose, AWS CLI, and CloudWatch agent. |
| `ec2.tf` | Ubuntu 24.04 LTS dynamic AMI lookup, EC2 instance, and Elastic IP attachment. |
| `outputs.tf` | Prints the Elastic Public IP, SSH command, and Application URL. |
| `terraform.tfvars.example` | Template for your custom variables. |

---

## 🚀 Step-by-Step Usage Guide

### 1. Prerequisites
Ensure you have installed:
* [Terraform](https://developer.hashicorp.com/terraform/downloads) (`>= 1.5.0`)
* [AWS CLI](https://aws.amazon.com/cli/) configured with an IAM user having EC2, VPC, and IAM permissions:
  ```bash
  aws configure
  ```

### 2. Configure Variables
Copy the example variables file:
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```
Edit `terraform.tfvars` with your preferred settings:
* Set `ssh_key_name` to an existing AWS Key Pair name, OR supply `ssh_public_key`.
* Set `aws_region` (default: `ap-south-1` Mumbai).
* Set `instance_type` (default: `t3.small`).

### 3. Initialize Terraform
Downloads the AWS provider plugins:
```bash
terraform init
```

### 4. Review the Plan
Inspect the resources Terraform will create:
```bash
terraform plan
```

### 5. Apply & Provision Infrastructure
Deploy all AWS resources:
```bash
terraform apply -auto-approve
```
*Terraform will output your Elastic IP and SSH command when complete!*

```
Outputs:
server_public_ip = "13.233.xxx.xxx"
ssh_command = "ssh -i <your-key.pem> ubuntu@13.233.xxx.xxx"
application_url = "http://13.233.xxx.xxx"
```

### 6. Verify Server Bootstrap
Connect to your new server:
```bash
ssh -i /path/to/key.pem ubuntu@<server_public_ip>
```
Verify that Docker, Compose, and AWS CLI were installed by `user_data.sh`:
```bash
docker --version
docker compose version
aws --version
cat /var/log/user_data.log
```

---

## 🧹 Destroy Infrastructure (Clean Up)

When you are done testing and want to avoid AWS costs:
```bash
terraform destroy -auto-approve
```
All EC2 instances, Elastic IPs, Security Groups, and VPC networking resources will be safely deleted.
