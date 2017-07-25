## Whatizit?
The **drive-frame** JavaScript library provides a simple and extensible 
framework for modeling and controlling DIY manufacturing robots. 
A DIY manufacturing robot is modeled as a <var>DriveFrame</var>,
which is a collection of one or more individually controllable
stepper motor drives. Drive topology is unrestricted, and
a <var>DriveFrame</var> can represent a broad range of robots
(e.g., Cartesian, delta, etc.). The consistency and generality of 
DriveFrame representation therefore greatly simplifies 
the design and prototyping of established and experimental DIY robot configurations. 

### Coordinates
A <var>DriveFrame</var> works with the following coordinates:

1. **Motor coordinates** are the smallest digital positioning unit and are typically 1:1 with microsteps.
1. **Drive coordinates** are the drive-relative positioning unit (e.g., mm or degrees).
1. **Effector/World coordinates** are the world coordinates of the effector. Note that one or more drive coordinates can correspond to the same effector coordinate (e.g., consider SCARA elbows).


### StepperDrive
A <var>StepperDrive</var> maps drive coordinates to motor coordinates and v.v. 
The following configurations are supported:

* **BeltDrive**
* **ScrewDrive**
* **GearDrive**
