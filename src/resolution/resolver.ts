import { InstanceValueProvider } from "../bindings/instance-value-provider";
import { interfaces } from "../interfaces/interfaces";
import { getBindingDictionary } from "../planning/planner";
import { isPromise } from "../utils/async";
import { resolveInstance } from "./instantiation";

const _resolveRequest = <T>(request: interfaces.Request): undefined | T | Promise<T> | (T | Promise<T>)[] => {

    request.parentContext.setCurrentRequest(request);

    const bindings = request.bindings;
    const childRequests = request.childRequests;

    const targetIsAnArray = request.target && request.target.isArray();

    const targetParentIsNotAnArray = !request.parentRequest ||
                                   !request.parentRequest.target ||
                                   !request.target ||
                                   !request.parentRequest.target.matchesArray(request.target.serviceIdentifier);

    if (targetIsAnArray && targetParentIsNotAnArray) {

        // Create an array instead of creating an instance
        return childRequests.map((childRequest: interfaces.Request) => {
            return _resolveRequest(childRequest) as T | Promise<T>
        });

    } else {
        if (request.target.isOptional() && bindings.length === 0) {
            return undefined;
        }

        const binding = bindings[0];

        return _resolveBinding<T>(request, binding);
    }
};

const _getResolvedFromBinding = <T>(
    request: interfaces.Request,
    binding:interfaces.Binding<T>,
): T | Promise<T> => {
    const childRequests = request.childRequests;
    if(binding.valueProvider instanceof InstanceValueProvider){
        return resolveInstance<T>(
            binding,
            binding.valueProvider.valueFrom,
            childRequests,
            _resolveRequest
        );
    }

    return binding.provideValue(request.parentContext, childRequests)
}

const _resolveInScope = <T>(
    request:interfaces.Request,
    binding:interfaces.Binding<T>,
    resolveFromBinding: () => T | Promise<T>
): T | Promise<T> => {
    const fromScope = binding.resolveScope.get(binding,request);
    if(fromScope !==null){
        return fromScope;
    }
    return binding.resolveScope.set(binding,request, resolveFromBinding());
}

const _resolveBinding = <T>(
    request: interfaces.Request,
    binding:interfaces.Binding<T>,
): T | Promise<T> => {
    return _resolveInScope(request,binding, () => {
        let result = _getResolvedFromBinding(request, binding);
        if (isPromise(result)) {
            result = result.then((resolved) => _onActivation(request, binding, resolved));
        } else {
            result = _onActivation<T>(request, binding, result);
        }
        return result;
    })
}

function _onActivation<T>(request: interfaces.Request, binding: interfaces.Binding<T>, resolved: T): T | Promise<T> {
    let result = _bindingActivation(request.parentContext, binding, resolved);

    const containersIterator = _getContainersIterator(request.parentContext.container);

    let container: interfaces.Container;
    let containersIteratorResult = containersIterator.next();

    do {
        container = containersIteratorResult.value;
        const context = request.parentContext;
        const serviceIdentifier = request.serviceIdentifier;
        const activationsIterator = _getContainerActivationsForService(container, serviceIdentifier);

        if (isPromise(result)) {
            result = _activateContainerAsync<T>(activationsIterator, context, result);
        } else {
            result = _activateContainer<T>(activationsIterator, context, result);
        }

        containersIteratorResult = containersIterator.next();

        // make sure if we are currently on the container that owns the binding, not to keep looping down to child containers
    } while (containersIteratorResult.done !== true && !getBindingDictionary(container).hasKey(request.serviceIdentifier));

    return result;
}

const _bindingActivation = <T>(context: interfaces.Context, binding: interfaces.Binding<T>, previousResult: T): T | Promise<T> => {
    let result: T | Promise<T>;

    // use activation handler if available
    if (typeof binding.onActivation === "function") {
        result = binding.onActivation(context, previousResult);
    } else {
        result = previousResult;
    }

    return result;
}

const _activateContainer = <T> (
    activationsIterator: Iterator<interfaces.BindingActivation<any>>,
    context: interfaces.Context,
    result: T,
): T | Promise<T> => {
    let activation = activationsIterator.next();

    while (!activation.done) {
        result = activation.value(context, result);

        if (isPromise<T>(result)) {
            return _activateContainerAsync(activationsIterator, context, result);
        }

        activation = activationsIterator.next();
    }

    return result;
}

const _activateContainerAsync = async<T>(
    activationsIterator: Iterator<interfaces.BindingActivation<any>>,
    context: interfaces.Context,
    resultPromise: Promise<T>,
): Promise<T> => {
    let result = await resultPromise
    let activation = activationsIterator.next();

    while (!activation.done) {
      result = await activation.value(context, result);

      activation = activationsIterator.next();
    }

    return result;
}

const _getContainerActivationsForService = <T>(container: interfaces.Container, serviceIdentifier: interfaces.ServiceIdentifier<T>) => {
    // smell accessing _activations, but similar pattern is done in planner.getBindingDictionary()
    const activations = (container as any)._activations as interfaces.Lookup<interfaces.BindingActivation<any>>;

    return activations.hasKey(serviceIdentifier) ? activations.get(serviceIdentifier).values() : [].values();
}

const _getContainersIterator = (container: interfaces.Container): Iterator<interfaces.Container> => {
    const containersStack: interfaces.Container[] = [container];

    let parent = container.parent;

    while (parent !== null) {
        containersStack.push(parent);

        parent = parent.parent;
    }

    const getNextContainer: () => IteratorResult<interfaces.Container> = () => {
        const nextContainer = containersStack.pop();

        if (nextContainer !== undefined) {
            return { done: false, value: nextContainer };
        } else {
            return { done: true, value: undefined };
        }
    };

    const containersIterator: Iterator<interfaces.Container> = {
        next: getNextContainer,
    };

    return containersIterator;
}

function resolve<T>(context: interfaces.Context): T | Promise<T> | (T | Promise<T>)[] {
    return _resolveRequest<T>(context.plan.rootRequest)  as T | Promise<T> | (T | Promise<T>)[];
}

export { resolve };
