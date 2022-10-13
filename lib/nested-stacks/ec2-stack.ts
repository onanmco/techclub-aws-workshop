import { NestedStack, NestedStackProps } from "aws-cdk-lib";
import { CfnKeyPair, IInstance, Instance, InstanceClass, InstanceSize, InstanceType, ISecurityGroup, ISubnet, IVpc, MachineImage } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

interface Ec2StackProps extends NestedStackProps {
  envName: string;
  appName: string;
  vpc: IVpc;
  subnets: { [key: string]: ISubnet },
  bastionHostSecurityGroup: ISecurityGroup
}

export class Ec2Stack extends NestedStack {
  private readonly bastionHosts: IInstance[];
  private readonly keypair: CfnKeyPair;

  public getBastionHosts() {
    return this.bastionHosts;
  }

  public getKeypair() {
    return this.keypair;
  }
  
  constructor(scope: Construct, id: string, props: Ec2StackProps) {
    super(scope, id, props);

    const { envName, appName } = props;

    this.keypair = new CfnKeyPair(this, "keypair", {
      keyName: `${envName}-${appName}-keypair`,
      keyType: "rsa"
    });

    const bastionHostSubnets = Object.keys(props.subnets)
      .filter(v => v.includes("bastion"))
      .map(v => props.subnets[v]);

    this.bastionHosts = bastionHostSubnets.map(subnet => {
      return new Instance(this, `${envName}-${appName}-${subnet.availabilityZone}-bastion-host`, {
        instanceName: `${envName}-${appName}-${subnet.availabilityZone}-bastion-host`,
        instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
        machineImage: MachineImage.latestAmazonLinux(),
        vpc: props.vpc,
        allowAllOutbound: true,
        availabilityZone: subnet.availabilityZone,
        securityGroup: props.bastionHostSecurityGroup,
        vpcSubnets: {
          availabilityZones: [subnet.availabilityZone],
          subnets: [subnet]
        },
        keyName: this.keypair.keyName
      });
    });
  }
}