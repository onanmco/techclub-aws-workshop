import { NestedStack, NestedStackProps, RemovalPolicy } from "aws-cdk-lib";
import { CfnGatewayRouteTableAssociation, CfnInternetGateway, CfnNatGateway, CfnRouteTable, CfnSubnetRouteTableAssociation, ISecurityGroup, ISubnet, IVpc, Peer, Port, SecurityGroup, Subnet, Vpc } from "aws-cdk-lib/aws-ec2";
import { ISubnetGroup, SubnetGroup } from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface NetworkStackProps extends NestedStackProps {
  envName: string;
  appName: string;
}

export class NetworkStack extends NestedStack {
  private readonly vpc: IVpc;
  private readonly subnets: { [key: string]: ISubnet };
  private readonly dbSubnetGroup: ISubnetGroup;
  private readonly bastionHostSecurityGroup: ISecurityGroup;
  private readonly lambdaSecurityGroup: ISecurityGroup;
  private readonly dbSecurityGroup: ISecurityGroup;

  public getVpc() {
    return this.vpc;
  }

  public getSubnets() {
    return this.subnets;
  }

  public getDbSubnetGroup() {
    return this.dbSubnetGroup;
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
      enableDnsSupport: true
    });

    const subnetDefinitions = [
      {
        name: "private-db-subnet-1",
        cidrBlock: "172.16.0.0/22",
        availabilityZone: this.availabilityZones[0],
      },
      {
        name: "private-db-subnet-2",
        cidrBlock: "172.16.4.0/22",
        availabilityZone: this.availabilityZones[1],
      },
      {
        name: "public-bastion-host-subnet-1",
        cidrBlock: "172.16.8.0/22",
        availabilityZone: this.availabilityZones[0],
      },
      {
        name: "public-bastion-host-subnet-2",
        cidrBlock: "172.16.12.0/22",
        availabilityZone: this.availabilityZones[1],
      },
      {
        name: "private-lambda-subnet-1",
        cidrBlock: "172.16.16.0/22",
        availabilityZone: this.availabilityZones[0],
      },
      {
        name: "private-lambda-subnet-2",
        cidrBlock: "172.16.20.0/22",
        availabilityZone: this.availabilityZones[1],
      },
    ];

    subnetDefinitions.filter(v => v.name.startsWith("public"))
      .forEach(v => {
        this.subnets[v.name] = new Subnet(this, v.name, {
          vpcId: this.vpc.vpcId,
          cidrBlock: v.cidrBlock,
          availabilityZone: v.availabilityZone
        });
      });

    const igw = new CfnInternetGateway(this, "igw", {
      tags: [
        {
          key: "Name",
          value: `${envName}-${appName}-igw`
        }
      ]
    });

    const igwRt = new CfnRouteTable(this, "igw-rt", {
      vpcId: this.vpc.vpcId,
      tags: [
        {
          key: "Name",
          value: `${envName}-${appName}-igw-rt`
        }
      ]
    });

    new CfnGatewayRouteTableAssociation(this, "igw-rt-assoc", {
      gatewayId: igw.attrInternetGatewayId,
      routeTableId: igwRt.attrRouteTableId
    });

    subnetDefinitions.filter(v => v.name.startsWith("public"))
      .forEach(v => {
        new CfnSubnetRouteTableAssociation(this, `${v.name}-igw-rt-assoc`, {
          routeTableId: igwRt.attrRouteTableId,
          subnetId: this.subnets[v.name].subnetId
        });
      });

    interface NatGatewayRouteTable {
      gateway: CfnNatGateway;
      routeTable: CfnRouteTable;
    }

    const uniqueAzsPerPublicSubnet = new Set(subnetDefinitions.filter(v => v.name.startsWith("public"))
      .map(v => v.availabilityZone));

    const natGatewayRouteTablesPerAz: { [key: string]: NatGatewayRouteTable } = {};

    uniqueAzsPerPublicSubnet.forEach(az => {
      const subnet = Object.values(this.subnets)
        .find(v => v.availabilityZone == az);

      natGatewayRouteTablesPerAz[az] = {
        gateway: new CfnNatGateway(this, `${az}-nat-gw`, {
          subnetId: subnet?.subnetId as string,
          connectivityType: "public",
          tags: [
            {
              key: "Name",
              value: `${envName}-${appName}-${az}-nat-gw`
            }
          ]
        }),
        routeTable: new CfnRouteTable(this, `${az}-nat-gw-rt`, {
          vpcId: this.vpc.vpcId,
          tags: [
            {
              key: "Name",
              value: `${envName}-${appName}-${az}-nat-gw-rt`
            }
          ]
        })
      };
    });

    subnetDefinitions.filter(v => v.name.includes("lambda"))
      .forEach(v => {
        const subnet = this.subnets[v.name];
        const { routeTable } = natGatewayRouteTablesPerAz[v.availabilityZone];

        new CfnSubnetRouteTableAssociation(this, `${v.name}-nat-gw-assoc`, {
          subnetId: subnet.subnetId,
          routeTableId: routeTable.attrRouteTableId
        });
      });

    const dbSubnets = subnetDefinitions.filter(v => v.name.includes("db"))
      .map(v => this.subnets[v.name]);

    this.dbSubnetGroup = new SubnetGroup(this, "db-subnet-group", {
      subnetGroupName: `${envName}-${appName}-db-subnet-group`,
      description: `${envName}-${appName}-db-subnet-group`,
      vpc: this.vpc,
      removalPolicy: RemovalPolicy.DESTROY,
      vpcSubnets: {
        availabilityZones: dbSubnets.map(v => v.availabilityZone),
        subnets: dbSubnets
      }
    });

    this.bastionHostSecurityGroup = new SecurityGroup(this, "bastion-host-sg", {
      vpc: this.vpc,
      securityGroupName: `${envName}-${appName}-bastion-host-sg`,
      description: `${envName}-${appName}-bastion-host-sg`
    });

    this.bastionHostSecurityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(22),
      "SSH from everywhere"
    );

    this.bastionHostSecurityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.allTcp()
    );

    this.lambdaSecurityGroup = new SecurityGroup(this, "lambda-sg", {
      vpc: this.vpc,
      securityGroupName: `${envName}-${appName}-lambda-sg`,
      description: `${envName}-${appName}-lambda-sg`
    });

    this.lambdaSecurityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.allTcp()
    );

    this.dbSecurityGroup = new SecurityGroup(this, "db-sg", {
      vpc: this.vpc,
      securityGroupName: `${envName}-${appName}-db-sg`,
      description: `${envName}-${appName}-db-sg`
    });

    this.dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(this.bastionHostSecurityGroup.securityGroupId),
      Port.tcp(5432),
      "From bastion host to RDS"
    );

    this.dbSecurityGroup.addIngressRule(
      Peer.securityGroupId(this.lambdaSecurityGroup.securityGroupId),
      Port.tcp(5432),
      "From Lambda to RDS"
    );

    this.dbSecurityGroup.addEgressRule(
      Peer.anyIpv4(),
      Port.allTcp()
    );
  }
}