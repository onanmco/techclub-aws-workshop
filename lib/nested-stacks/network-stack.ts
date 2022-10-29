import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { ISecurityGroup, ISubnet, IVpc, Peer, Port, SecurityGroup, Subnet, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface NetworkStackProps extends NestedStackProps {
  envName: string;
  appName: string;
}

export class NetworkStack extends NestedStack {
  private readonly vpc: IVpc;
  private readonly bastionHostSecurityGroup: ISecurityGroup;
  private readonly lambdaSecurityGroup: ISecurityGroup;
  private readonly dbSecurityGroup: ISecurityGroup;
  private readonly bastionHostSubnet: ISubnet;

  public getVpc() {
    return this.vpc;
  }

  public getBastionHostSecurityGroup() {
    return this.bastionHostSecurityGroup;
  }

  public getLambdaSecurityGroup() {
    return this.lambdaSecurityGroup;
  }

  public getDbSecurityGroup() {
    return this.dbSecurityGroup;
  }

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { envName, appName } = props;

    this.vpc = new Vpc(this, "vpc", {
      vpcName: `${envName}-${appName}-vpc`,
      cidr: "172.16.0.0/16",
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 2,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: `${envName}-${appName}-public-nat-gw-subnets`,
          cidrMask: 22,
          subnetType: SubnetType.PUBLIC
        },
        {
          name: `${envName}-${appName}-private-lambda-subnet`,
          cidrMask: 22,
          subnetType: SubnetType.PRIVATE_WITH_EGRESS
        },
        {
          name: `${envName}-${appName}-private-rds-subnet`,
          cidrMask: 22,
          subnetType: SubnetType.PRIVATE_ISOLATED
        }
      ],
      
      natGatewaySubnets: {
        subnetGroupName: `${envName}-${appName}-public-nat-gw-subnets`
      }
    });

    this.bastionHostSubnet = new Subnet(this, "bastion-host-subnet", {
      vpcId: this.vpc.vpcId,
      availabilityZone: this.vpc.availabilityZones[0],
      cidrBlock: "172.16.24.0/22"
    });

    this.bastionHostSecurityGroup = new SecurityGroup(this, "bastion-host-sg", {
      vpc: this.vpc,
      allowAllOutbound: true,
      securityGroupName: `${envName}-${appName}-bastion-host-sg`
    });

    this.bastionHostSecurityGroup.addIngressRule(
      Peer.anyIpv4(), 
      Port.tcp(22), 
      "From SSH to bastion host."
    );

    this.lambdaSecurityGroup = new SecurityGroup(this, "lambda-sg", {
      vpc: this.vpc,
      allowAllOutbound: true,
      securityGroupName: `${envName}-${appName}-lambda-sg`
    });

    this.dbSecurityGroup = new SecurityGroup(this, "db-sg", {
      vpc: this.vpc,
      allowAllOutbound: true,
      securityGroupName: `${envName}-${appName}-db-sg`
    });

    this.dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(this.bastionHostSecurityGroup.securityGroupId),
      Port.tcp(5432),
      "From bastion host to DB."
    );

    this.dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(this.lambdaSecurityGroup.securityGroupId),
      Port.tcp(5432),
      "From Lambda to DB."
    );
  }
}