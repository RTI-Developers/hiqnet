class Parameter
{
    public readonly DataType: string;
    public readonly Id: string;
    public readonly Index: number;
    public readonly IsSetAllowed: boolean;
    public readonly IsSubscribeEnabled: boolean;
    public readonly Name: string;
    public readonly ObjectAddress: string;
    public readonly SensorRate: string;
    public readonly SetMethod: ('Set' | 'Set %');
    public readonly SubscriptionType: string;
    public readonly VariableType: ('Boolean' | 'Integer' | 'String');
}