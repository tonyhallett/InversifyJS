import { BindingScopeEnum } from "../constants/literal_types";
import { interfaces } from "../interfaces/interfaces";
import { BindingWhenOnSyntax } from "./binding_when_on_syntax";

class BindingInSyntax<T> implements interfaces.BindingInSyntax<T> {

    private _binding: interfaces.Binding<T>;

    public constructor(binding: interfaces.Binding<T>) {
        this._binding = binding;
    }

    public inRequestScope(): interfaces.BindingWhenOnSyntax<T> {
        return this.setScope(BindingScopeEnum.Request);
    }

    public inSingletonScope(): interfaces.BindingWhenOnSyntax<T> {
        return this.setScope(BindingScopeEnum.Singleton);
    }

    public inTransientScope(): interfaces.BindingWhenOnSyntax<T> {
        return this.setScope(BindingScopeEnum.Transient);
    }

    private setScope(scope:interfaces.BindingScope): interfaces.BindingWhenOnSyntax<T>{
        this._binding.setScope(scope);
        return new BindingWhenOnSyntax<T>(this._binding);
    }
}

export { BindingInSyntax };
